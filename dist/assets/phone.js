const PREFIX = '+380';
const MAX_DIGITS = 9;

/** Accept local 067…, subscriber 67…, international +380… and the old +38 (067)… format. */
export function subscriberDigits(value) {
  const raw = String(value ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00380')) digits = digits.slice(5);
  else if (raw.startsWith('+380') || (digits.startsWith('380') && (digits.length > MAX_DIGITS || digits === '380'))) digits = digits.slice(3);
  else if (raw.startsWith('+38') || digits.startsWith('0038') || (digits.startsWith('38') && digits.length > 10)) {
    digits = digits.slice(digits.startsWith('0038') ? 4 : 2);
    if (digits.startsWith('0')) digits = digits.slice(1);
  } else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, MAX_DIGITS);
}

export function nationalDigits(value) {
  const digits = subscriberDigits(value);
  return digits ? '0' + digits : '';
}

function displayDigits(digits) {
  if (!digits) return PREFIX;
  let value = PREFIX + ' (' + digits.slice(0, 2);
  if (digits.length >= 2) value += ')';
  if (digits.length > 2) value += ' ' + digits.slice(2, 5);
  if (digits.length > 5) value += ' ' + digits.slice(5, 7);
  if (digits.length > 7) value += ' ' + digits.slice(7, 9);
  return value;
}

export function formatPhone(value) {
  return displayDigits(subscriberDigits(value));
}

export function isValidPhone(value) {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('+') && !raw.startsWith('+38')) return false;
  const complete = /^(?:[1-9]\d{8}|0[1-9]\d{8}|380[1-9]\d{8}|38[1-9]\d{8}|00380[1-9]\d{8}|0038[1-9]\d{8})$/.test(raw.replace(/\D/g, ''));
  if (!complete) return false;
  return /^[1-9]\d{8}$/.test(subscriberDigits(raw));
}

/** Edit subscriber digits directly; the prefix and punctuation never become editable data. */
export function attachPhoneInput(input) {
  let digits = subscriberDigits(input.value);
  let writing = false;
  let pending = null;
  const undo = [];
  const redo = [];

  const logicalPosition = offset => {
    let count = 0;
    for (let index = PREFIX.length; index < Math.min(offset, input.value.length); index++) {
      if (/\d/.test(input.value[index])) count++;
    }
    return Math.min(count, digits.length);
  };
  const selection = () => ({
    start: logicalPosition(input.selectionStart ?? input.value.length),
    end: logicalPosition(input.selectionEnd ?? input.value.length)
  });
  const caretPosition = count => {
    if (!count) return digits.length ? PREFIX.length + 2 : PREFIX.length;
    let seen = 0;
    for (let index = PREFIX.length; index < input.value.length; index++) {
      if (/\d/.test(input.value[index]) && ++seen === count) {
        return input.value[index + 1] === ')' ? index + 2 : index + 1;
      }
    }
    return input.value.length;
  };
  const render = cursor => {
    input.value = displayDigits(digits);
    const position = caretPosition(cursor);
    input.setSelectionRange(position, position);
    input.setCustomValidity('');
    input.setAttribute('aria-invalid', 'false');
  };
  const emit = () => {
    writing = true;
    input.dispatchEvent(new Event('input', {bubbles: true}));
    writing = false;
  };
  const commit = (next, cursor, remember = true) => {
    next = next.replace(/\D/g, '').slice(0, MAX_DIGITS);
    const changed = next !== digits;
    if (changed && remember) {
      undo.push({digits, cursor: selection().start});
      if (undo.length > 100) undo.shift();
      redo.length = 0;
    }
    digits = next;
    render(Math.min(cursor, digits.length));
    if (changed) emit();
  };
  const remove = (type, range = selection()) => {
    let {start, end} = range;
    if (start === end) {
      if (type.includes('Backward')) start = Math.max(0, start - 1);
      else end = Math.min(digits.length, end + 1);
    }
    commit(digits.slice(0, start) + digits.slice(end), start);
  };
  const insert = (text, range = selection(), pasted = false) => {
    const raw = String(text ?? '').trim();
    let added = raw.replace(/\D/g, '');
    if (!added) { render(range.start); return; }
    // A complete phone number replaces the whole value, even if pasted beside the prefix.
    const complete = raw.startsWith('+') || added.startsWith('0038') || added.length >= 10 || (pasted && added.length === MAX_DIGITS);
    if (complete) {
      if (raw.startsWith('+') && !raw.startsWith('+38')) { render(range.start); return; }
      const next = subscriberDigits(raw);
      commit(next, next.length);
      return;
    }
    // The local leading 0 is already present in +380.
    if (range.start === 0 && added.startsWith('0')) added = added.slice(1);
    const available = MAX_DIGITS - (digits.length - (range.end - range.start));
    added = added.slice(0, available);
    commit(digits.slice(0, range.start) + added + digits.slice(range.end), range.start + added.length);
  };

  render(digits.length);
  input.addEventListener('beforeinput', event => {
    pending = {type: event.inputType, data: event.data, range: selection(), prefixOnly: (input.selectionEnd ?? 0) <= PREFIX.length};
    if (!event.cancelable || event.isComposing) return;
    if (event.inputType.startsWith('delete')) {
      if ((input.selectionEnd ?? 0) <= PREFIX.length) {
        event.preventDefault(); render(0); pending = null; return;
      }
      event.preventDefault(); remove(event.inputType, pending.range); pending = null;
    } else if (event.inputType.startsWith('insert') && event.data !== null) {
      event.preventDefault(); insert(event.data, pending.range); pending = null;
    }
  });
  input.addEventListener('input', event => {
    if (writing || event.isComposing) return;
    const operation = pending;
    pending = null;
    // Some mobile keyboards emit beforeinput without allowing cancellation.
    if (operation?.type.startsWith('delete')) {
      if (operation.prefixOnly) render(0);
      else remove(operation.type, operation.range);
    }
    else if (operation?.type.startsWith('insert') && operation.data !== null) insert(operation.data, operation.range);
    else {
      // Autofill and programmatic changes may arrive without beforeinput.
      const next = subscriberDigits(input.value);
      commit(next, next.length);
    }
  });
  input.addEventListener('paste', event => {
    if (!event.clipboardData) return;
    event.preventDefault(); pending = null;
    insert(event.clipboardData.getData('text'), selection(), true);
  });
  input.addEventListener('cut', event => {
    if (!event.clipboardData) return;
    event.preventDefault(); pending = null;
    event.clipboardData.setData('text', input.value.slice(input.selectionStart, input.selectionEnd));
    const range = selection();
    if (range.start !== range.end) remove('deleteByCut', range);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Home' && !event.shiftKey) {
      event.preventDefault(); const position = caretPosition(0); input.setSelectionRange(position, position);
    }
    if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault(); pending = null;
      const backwards = event.key.toLowerCase() === 'z' && !event.shiftKey;
      const from = backwards ? undo : redo;
      const to = backwards ? redo : undo;
      const previous = from.pop();
      if (previous) {
        to.push({digits, cursor: selection().start});
        commit(previous.digits, previous.cursor, false);
      }
    }
  });
  input.addEventListener('compositionend', () => {
    pending = null; const next = subscriberDigits(input.value); commit(next, next.length);
  });
  input.addEventListener('blur', () => { pending = null; input.value = displayDigits(digits); });
  input.form?.addEventListener('reset', () => {
    queueMicrotask(() => {undo.length = 0; redo.length = 0; commit(subscriberDigits(input.defaultValue), 0, false);});
  });
}
