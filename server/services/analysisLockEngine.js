/**
 * ============================================================================
 * ANALYSIS LOCK ENGINE (SERVER-SIDE REUSABLE SHIFT & TIMING LOCKING SERVICE)
 * ============================================================================
 *
 * Provides a universal, authoritative state machine for shift-based,
 * timing-based, hybrid, and daily (neither) QCL analyses.
 *
 * Core Business Rules Enforced:
 * 1. Initial State: Only the first configured shift/timing is open; later items locked.
 * 2. Sequential Progression: An item cannot be saved before its predecessor has been saved.
 * 3. First Save & Unlock: Saving item i persists it, unlocks item i+1, and grants item i
 *    exactly ONE permitted correction window before item i+1 is saved.
 * 4. Correction Behavior:
 *    - If correction used on item i before item i+1 saved -> permanently lock item i.
 *    - If item i+1 is saved before item i uses its correction -> permanently lock item i.
 * 5. Final Item: Permits exactly ONE correction after its initial save, then permanently locked.
 * 6. Analyses with Neither: Fully open for normal saving/editing without sequential locking.
 * 7. Date-Wise Isolation: State is isolated by Plant + Analysis + Date.
 * 8. Server-Side Authority: Evaluated and enforced on all API endpoints.
 */

/**
 * Standard Shift Constants & Normalization
 */
const DEFAULT_SHIFTS_3 = ['shift1', 'shift2', 'shift3'];
const DEFAULT_SHIFTS_2 = ['shift1', 'shift2'];

const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  'Shift 1': 'I SHIFT',
  'Shift 2': 'II SHIFT',
  'Shift 3': 'III SHIFT',
  'I Shift': 'I SHIFT',
  'II Shift': 'II SHIFT',
  'III Shift': 'III SHIFT',
  'I SHIFT': 'I SHIFT',
  'II SHIFT': 'II SHIFT',
  'III SHIFT': 'III SHIFT',
};

/**
 * Compares two scalar values for analytical differences, preserving numeric precision.
 */
const isValueDifferent = (oldVal, newVal) => {
  if (oldVal === undefined || oldVal === null || oldVal === '' || oldVal === '–' || oldVal === '-') oldVal = null;
  if (newVal === undefined || newVal === null || newVal === '' || newVal === '–' || newVal === '-') newVal = null;
  if (oldVal === null && newVal === null) return false;
  if (oldVal === null || newVal === null) return true;
  if (!isNaN(Number(oldVal)) && !isNaN(Number(newVal))) {
    return Number(oldVal) !== Number(newVal);
  }
  return String(oldVal) !== String(newVal);
};

/**
 * Normalizes an item key (e.g. 'I Shift' -> 'shift1', '07:00' -> '07:00')
 */
const normalizeItemKey = (key) => {
  if (!key) return '';
  const s = String(key).trim();
  const lower = s.toLowerCase();
  if (lower === 'shift1' || lower === 'shift 1' || lower === 'ishift' || lower === 'i shift' || lower === 'i_shift' || lower === 'shift i' || lower === 'i') return 'shift1';
  if (lower === 'shift2' || lower === 'shift 2' || lower === 'iishift' || lower === 'ii shift' || lower === 'ii_shift' || lower === 'shift ii' || lower === 'ii') return 'shift2';
  if (lower === 'shift3' || lower === 'shift 3' || lower === 'iiishift' || lower === 'iii shift' || lower === 'iii_shift' || lower === 'shift iii' || lower === 'iii') return 'shift3';
  return s;
};

/**
 * Computes the initial default lock state for an analysis.
 *
 * @param {Object} options
 * @param {'shift'|'timing'|'both'|'neither'} options.type - Analysis entry type
 * @param {string[]} [options.items] - Ordered list of shift or timing identifiers
 * @returns {Object} Canonical lock state
 */
const getInitialLockState = ({ type = 'shift', items = DEFAULT_SHIFTS_3 } = {}) => {
  if (type === 'neither') {
    return {
      type: 'neither',
      isUnrestricted: true,
      allPermanentlyLocked: false,
      items: [],
      slots: {},
    };
  }

  const normalizedItems = (items || DEFAULT_SHIFTS_3).map(normalizeItemKey);
  const slots = {};

  normalizedItems.forEach((itemKey, index) => {
    slots[itemKey] = {
      isSaved: false,
      isOpen: index === 0, // only first is open initially
      isLocked: index > 0, // subsequent locked
      correctionUsed: false,
      editsCount: 0,
    };
  });

  const state = {
    type,
    items: normalizedItems,
    slots,
    allPermanentlyLocked: false,
  };

  // Synchronize legacy fields for backward compatibility with existing frontends/schemas
  syncLegacyFields(state);
  return state;
};

/**
 * Synchronizes backward-compatible legacy fields onto the canonical state object.
 */
const syncLegacyFields = (state) => {
  if (!state || !state.slots) return state;

  const slots = state.slots;
  const s1 = slots.shift1 || {};
  const s2 = slots.shift2 || {};
  const s3 = slots.shift3 || {};

  state.shift1Saved = Boolean(s1.isSaved);
  state.shift2Saved = Boolean(s2.isSaved);
  state.shift3Saved = Boolean(s3.isSaved);
  state.s1Saved = Boolean(s1.isSaved);
  state.s2Saved = Boolean(s2.isSaved);
  state.s3Saved = Boolean(s3.isSaved);

  state.shift1Edits = Number(s1.editsCount || (s1.correctionUsed ? 1 : 0));
  state.shift2Edits = Number(s2.editsCount || (s2.correctionUsed ? 1 : 0));
  state.shift3Edits = Number(s3.editsCount || (s3.correctionUsed ? 1 : 0));
  state.s1Edits = state.shift1Edits;
  state.s2Edits = state.shift2Edits;
  state.s3Edits = state.shift3Edits;

  state.shift1Locked = Boolean(s1.isLocked);
  state.shift2Locked = Boolean(s2.isLocked);
  state.shift3Locked = Boolean(s3.isLocked);
  state.s1Locked = Boolean(s1.isLocked);
  state.s2Locked = Boolean(s2.isLocked);
  state.s3Locked = Boolean(s3.isLocked);

  // Boolean flags where true means locked (disabled in UI)
  state.shift1 = !Boolean(s1.isOpen);
  state.shift2 = !Boolean(s2.isOpen);
  state.shift3 = !Boolean(s3.isOpen);
  state.s1 = !Boolean(s1.isOpen);
  state.s2 = !Boolean(s2.isOpen);
  state.s3 = !Boolean(s3.isOpen);

  // Time-slot / Timing-based analyses legacy support
  state.lockedSlots = state.lockedSlots || {};
  Object.entries(slots).forEach(([k, slot]) => {
    state.lockedSlots[k] = {
      initialSaved: Boolean(slot.isSaved),
      isLocked: Boolean(slot.isLocked),
      isOpen: Boolean(slot.isOpen),
      editCount: Number(slot.editsCount || 0),
    };
  });

  return state;
};

/**
 * Hydrates or converts any stored lock representation into the canonical engine format.
 *
 * @param {Object} rawData - Existing stored lock data or document data
 * @param {Object} options
 * @param {'shift'|'timing'|'both'|'neither'} options.type
 * @param {string[]} [options.items]
 * @returns {Object} Canonical state
 */
const hydrateLockState = (rawData = {}, { type = 'shift', items = DEFAULT_SHIFTS_3 } = {}) => {
  if (type === 'neither') {
    return {
      type: 'neither',
      isUnrestricted: true,
      allPermanentlyLocked: false,
      items: [],
      slots: {},
    };
  }

  const normalizedItems = (items || DEFAULT_SHIFTS_3).map(normalizeItemKey);
  const slots = {};

  // Check if rawData already has canonical slots
  const sourceSlots = rawData.slots || rawData.lockedSlots || {};
  const sourceLockedShifts = rawData.lockedShifts || rawData;

  normalizedItems.forEach((itemKey, index) => {
    const rawSlot = sourceSlots[itemKey] || {};
    
    // Detect saved status from legacy fields
    let isSaved = Boolean(
      rawSlot.isSaved ||
      rawSlot.initialSaved ||
      (itemKey === 'shift1' && (sourceLockedShifts.shift1Saved || sourceLockedShifts.s1Saved)) ||
      (itemKey === 'shift2' && (sourceLockedShifts.shift2Saved || sourceLockedShifts.s2Saved)) ||
      (itemKey === 'shift3' && (sourceLockedShifts.shift3Saved || sourceLockedShifts.s3Saved))
    );

    // Detect edits count / correction used
    let editsCount = Number(
      rawSlot.editsCount !== undefined
        ? rawSlot.editsCount
        : rawSlot.editCount !== undefined
        ? rawSlot.editCount
        : itemKey === 'shift1'
        ? sourceLockedShifts.shift1Edits || 0
        : itemKey === 'shift2'
        ? sourceLockedShifts.shift2Edits || 0
        : itemKey === 'shift3'
        ? sourceLockedShifts.shift3Edits || 0
        : 0
    );

    let correctionUsed = Boolean(rawSlot.correctionUsed || editsCount >= 1);

    // Detect locked status
    let isLocked = Boolean(
      rawSlot.isLocked ||
      (itemKey === 'shift1' && (sourceLockedShifts.shift1Locked || sourceLockedShifts.shift2Saved)) ||
      (itemKey === 'shift2' && (sourceLockedShifts.shift2Locked || sourceLockedShifts.shift3Saved)) ||
      (itemKey === 'shift3' && (sourceLockedShifts.shift3Locked || (isSaved && editsCount >= 1)))
    );

    // If an item was saved and correction is used, it is permanently locked
    if (isSaved && correctionUsed) {
      isLocked = true;
    }

    // Determine isOpen
    let isOpen = false;
    if (index === 0) {
      // First item: open if not locked
      isOpen = !isLocked;
    } else {
      // Subsequent items: open if predecessor saved and this item not locked
      const prevKey = normalizedItems[index - 1];
      const prevSaved = Boolean(
        slots[prevKey]?.isSaved ||
        sourceSlots[prevKey]?.isSaved ||
        sourceSlots[prevKey]?.initialSaved ||
        (prevKey === 'shift1' && (sourceLockedShifts.shift1Saved || sourceLockedShifts.s1Saved)) ||
        (prevKey === 'shift2' && (sourceLockedShifts.shift2Saved || sourceLockedShifts.s2Saved))
      );

      isOpen = prevSaved && !isLocked;
    }

    slots[itemKey] = {
      isSaved,
      isOpen,
      isLocked,
      correctionUsed,
      editsCount,
    };
  });

  // Re-verify successor saves lock predecessors permanently
  for (let i = 0; i < normalizedItems.length - 1; i++) {
    const currentKey = normalizedItems[i];
    const nextKey = normalizedItems[i + 1];
    if (slots[nextKey]?.isSaved) {
      slots[currentKey].isLocked = true;
      slots[currentKey].isOpen = false;
    }
  }

  // Check if all permanently locked
  const lastKey = normalizedItems[normalizedItems.length - 1];
  const lastSlot = slots[lastKey];
  const allPermanentlyLocked = Boolean(
    lastSlot && lastSlot.isSaved && (lastSlot.correctionUsed || lastSlot.isLocked)
  );

  const state = {
    type,
    items: normalizedItems,
    slots,
    allPermanentlyLocked,
  };

  syncLegacyFields(state);
  return state;
};

/**
 * Evaluates the human-readable UI status of an item.
 *
 * @param {Object} state - Canonical or hydrated lock state
 * @param {string} itemKey - Identifier
 * @param {string[]} [itemsOrder]
 * @returns {'NEW' | 'WAITING' | 'EDITABLE' | 'FINAL_EDIT' | 'LOCKED'}
 */
const getItemLockStatus = (state, itemKey, itemsOrder = DEFAULT_SHIFTS_3) => {
  if (!state || state.type === 'neither' || state.isUnrestricted) {
    return 'EDITABLE';
  }

  const hydrated = state.slots ? state : hydrateLockState(state, { items: itemsOrder });
  const normKey = normalizeItemKey(itemKey);
  const items = hydrated.items || itemsOrder.map(normalizeItemKey);
  const index = items.indexOf(normKey);

  if (index === -1) return 'EDITABLE';

  const slot = hydrated.slots[normKey] || { isSaved: false, isOpen: false, isLocked: true };

  // 1. If predecessor has not been saved yet, this item is WAITING
  if (index > 0) {
    const prevKey = items[index - 1];
    const prevSlot = hydrated.slots[prevKey];
    if (!prevSlot || !prevSlot.isSaved) {
      return 'WAITING';
    }
  }

  // 2. If explicitly locked, return LOCKED
  if (slot.isLocked) return 'LOCKED';

  // 3. Not saved yet, but predecessor is saved -> NEW
  if (!slot.isSaved) return 'NEW';

  // 4. Item is saved and eligible for correction edit
  const isFinalItem = index === items.length - 1;
  if (isFinalItem || !hydrated.slots[items[index + 1]]?.isSaved) {
    return 'FINAL_EDIT';
  }

  return 'EDITABLE';
};

/**
 * Validates whether an incoming save/edit request is legally permissible
 * according to the sequential locking rules.
 *
 * @param {Object} params
 * @param {Object} params.lockState - Existing stored lock state
 * @param {string} params.targetItem - Item being saved (e.g. 'shift1', '07:00')
 * @param {string[]} [params.itemsOrder] - Ordered list of items
 * @param {boolean} [params.isDiff] - Whether the values actually changed from saved values
 * @param {'shift'|'timing'|'both'|'neither'} [params.type] - Entry type
 * @returns {{ allowed: boolean, statusCode?: number, message?: string, isCorrection?: boolean }}
 */
const validateSequentialSave = ({
  lockState,
  targetItem,
  itemsOrder = DEFAULT_SHIFTS_3,
  isDiff = false,
  type = 'shift',
}) => {
  // Analyses with neither shifts nor timings are completely unrestricted
  if (type === 'neither' || lockState?.type === 'neither' || lockState?.isUnrestricted) {
    return { allowed: true };
  }

  const hydrated = lockState?.slots ? lockState : hydrateLockState(lockState, { type, items: itemsOrder });
  const items = hydrated.items || itemsOrder.map(normalizeItemKey);
  const normTarget = normalizeItemKey(targetItem);
  const targetIndex = items.indexOf(normTarget);

  if (targetIndex === -1) {
    return { allowed: true }; // Unknown item key treated as neutral
  }

  const targetName = SHIFT_DISPLAY_NAMES[normTarget] || normTarget.toUpperCase();

  // 1. Check if all items for this date are already permanently locked
  if (hydrated.allPermanentlyLocked) {
    return {
      allowed: false,
      statusCode: 400,
      message: `All shifts/timings for this date are permanently locked. No further edits permitted.`,
    };
  }

  const currentSlot = hydrated.slots[normTarget] || { isSaved: false, isLocked: false, editsCount: 0 };

  // 2. Predecessor Sequence Check: Predecessor must be saved first
  if (targetIndex > 0) {
    const prevKey = items[targetIndex - 1];
    const prevSlot = hydrated.slots[prevKey];
    const prevName = SHIFT_DISPLAY_NAMES[prevKey] || prevKey.toUpperCase();

    if (!prevSlot || !prevSlot.isSaved) {
      return {
        allowed: false,
        statusCode: 400,
        message: `Sequential restriction: ${prevName} must be completed and saved before proceeding to ${targetName}.`,
      };
    }
  }

  // 3. Successor Check: If any subsequent item was already saved, this item is permanently locked
  for (let j = targetIndex + 1; j < items.length; j++) {
    const nextKey = items[j];
    const nextSlot = hydrated.slots[nextKey];
    if (nextSlot && nextSlot.isSaved) {
      const nextName = SHIFT_DISPLAY_NAMES[nextKey] || nextKey.toUpperCase();
      return {
        allowed: false,
        statusCode: 400,
        message: `${targetName} is permanently locked because ${nextName} has already been saved.`,
      };
    }
  }

  // 4. Correction Limit Check: If already saved once and values changed
  if (currentSlot.isSaved) {
    if (currentSlot.isLocked || currentSlot.correctionUsed || (currentSlot.editsCount || 0) >= 1) {
      return {
        allowed: false,
        statusCode: 400,
        message: `${targetName} has already utilized its single permitted correction edit and is permanently locked.`,
      };
    }

    return { allowed: true, isCorrection: true };
  }

  // First-time save of this item
  return { allowed: true, isCorrection: false };
};

/**
 * Transitions the lock state after a successful save.
 *
 * @param {Object} params
 * @param {Object} params.lockState - Existing state
 * @param {string} params.targetItem - Item that was just saved
 * @param {string[]} [params.itemsOrder] - Ordered list of items
 * @param {boolean} [params.isCorrection] - Whether this save is a correction edit
 * @param {'shift'|'timing'|'both'|'neither'} [params.type]
 * @returns {Object} Updated canonical state
 */
const applySequentialSaveTransition = ({
  lockState,
  targetItem,
  itemsOrder = DEFAULT_SHIFTS_3,
  isCorrection = false,
  type = 'shift',
}) => {
  if (type === 'neither' || lockState?.type === 'neither') {
    return {
      type: 'neither',
      isUnrestricted: true,
      allPermanentlyLocked: false,
      items: [],
      slots: {},
    };
  }

  const hydrated = lockState?.slots ? JSON.parse(JSON.stringify(lockState)) : hydrateLockState(lockState, { type, items: itemsOrder });
  const items = hydrated.items || itemsOrder.map(normalizeItemKey);
  const normTarget = normalizeItemKey(targetItem);
  const targetIndex = items.indexOf(normTarget);

  if (targetIndex === -1) {
    return syncLegacyFields(hydrated);
  }

  const slot = hydrated.slots[normTarget];

  if (!slot.isSaved) {
    // ── First-time save of this item ──
    slot.isSaved = true;
    slot.editsCount = 0;
    slot.correctionUsed = false;
    slot.isOpen = true; // One correction available
    slot.isLocked = false;

    // Automatically unlock next item if one exists
    if (targetIndex + 1 < items.length) {
      const nextKey = items[targetIndex + 1];
      if (hydrated.slots[nextKey]) {
        hydrated.slots[nextKey].isOpen = true;
        hydrated.slots[nextKey].isLocked = false;
      }
    }

    // Permanently lock all preceding items
    for (let p = 0; p < targetIndex; p++) {
      const pKey = items[p];
      if (hydrated.slots[pKey]) {
        hydrated.slots[pKey].isLocked = true;
        hydrated.slots[pKey].isOpen = false;
      }
    }
  } else {
    // ── Correction save of this item ──
    slot.editsCount = (slot.editsCount || 0) + 1;
    slot.correctionUsed = true;
    slot.isLocked = true; // Permanently locked after correction!
    slot.isOpen = false;

    // Preceding items remain locked
    for (let p = 0; p < targetIndex; p++) {
      const pKey = items[p];
      if (hydrated.slots[pKey]) {
        hydrated.slots[pKey].isLocked = true;
        hydrated.slots[pKey].isOpen = false;
      }
    }

    // Successor item remains open if not locked
    if (targetIndex + 1 < items.length) {
      const nextKey = items[targetIndex + 1];
      if (hydrated.slots[nextKey] && !hydrated.slots[nextKey].isLocked) {
        hydrated.slots[nextKey].isOpen = true;
      }
    }
  }

  // Check if all items are now permanently locked
  const lastKey = items[items.length - 1];
  const lastSlot = hydrated.slots[lastKey];
  hydrated.allPermanentlyLocked = Boolean(
    lastSlot && lastSlot.isSaved && (lastSlot.correctionUsed || lastSlot.isLocked)
  );

  return syncLegacyFields(hydrated);
};

/**
 * Tracks field-level edits and records audit history items.
 *
 * @param {Object} params
 * @param {Object} params.oldRows - Previous database rows
 * @param {Object} params.newRows - Submitted rows
 * @param {string[]} params.fields - Param keys to compare
 * @param {string} params.editorName - User's name
 * @param {string|mongoose.Types.ObjectId} [params.editorId]
 * @param {string} [params.itemKey] - Shift or time key
 * @param {Object} [params.existingEditedFields]
 * @param {Array} [params.existingAuditHistory]
 * @returns {{ editedFields: Object, editAuditHistory: Array, hasChanges: boolean }}
 */
const recordFieldEdits = ({
  oldRows = {},
  newRows = {},
  fields = [],
  editorName = 'Plant Operator',
  editorId = null,
  itemKey = '',
  existingEditedFields = {},
  existingAuditHistory = [],
}) => {
  const editedFields = { ...existingEditedFields };
  const editAuditHistory = [...existingAuditHistory];
  let hasChanges = false;
  const nowIso = new Date().toISOString();

  fields.forEach((f) => {
    const oldVal = oldRows ? oldRows[f] : undefined;
    const newVal = newRows ? newRows[f] : undefined;

    if (isValueDifferent(oldVal, newVal)) {
      hasChanges = true;
      const fieldId = itemKey ? `${itemKey}_${f}` : f;
      editedFields[fieldId] = true;

      editAuditHistory.push({
        shiftKey: itemKey,
        field: f,
        paramKey: f,
        oldValue: oldVal !== undefined && oldVal !== null ? String(oldVal) : '',
        newValue: newVal !== undefined && newVal !== null ? String(newVal) : '',
        editedBy: editorName,
        editedById: editorId,
        timestamp: nowIso,
      });
    }
  });

  return { editedFields, editAuditHistory, hasChanges };
};

module.exports = {
  DEFAULT_SHIFTS_3,
  DEFAULT_SHIFTS_2,
  SHIFT_DISPLAY_NAMES,
  isValueDifferent,
  normalizeItemKey,
  getInitialLockState,
  hydrateLockState,
  getItemLockStatus,
  validateSequentialSave,
  applySequentialSaveTransition,
  recordFieldEdits,
};
