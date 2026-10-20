import React from 'react';
import { Lock, Clock, AlertTriangle, Unlock, Plus } from 'lucide-react';

export const DEFAULT_SHIFTS_3 = ['shift1', 'shift2', 'shift3'];
export const DEFAULT_SHIFTS_2 = ['shift1', 'shift2'];

export const SHIFT_DISPLAY_NAMES = {
  shift1: 'I SHIFT',
  shift2: 'II SHIFT',
  shift3: 'III SHIFT',
  'Shift 1': 'I SHIFT',
  'Shift 2': 'II SHIFT',
  'Shift 3': 'III SHIFT',
  'I Shift': 'I SHIFT',
  'II Shift': 'II SHIFT',
  'III Shift': 'III SHIFT',
};

/**
 * Normalizes an item key
 */
export const normalizeItemKey = (key) => {
  if (!key) return '';
  const s = String(key).trim();
  const lower = s.toLowerCase();
  if (lower === 'shift1' || lower === 'shift 1' || lower === 'ishift' || lower === 'i shift' || lower === 'i_shift' || lower === 'shift i' || lower === 'i') return 'shift1';
  if (lower === 'shift2' || lower === 'shift 2' || lower === 'iishift' || lower === 'ii shift' || lower === 'ii_shift' || lower === 'shift ii' || lower === 'ii') return 'shift2';
  if (lower === 'shift3' || lower === 'shift 3' || lower === 'iiishift' || lower === 'iii shift' || lower === 'iii_shift' || lower === 'shift iii' || lower === 'iii') return 'shift3';
  return s;
};

/**
 * Evaluates the status of an item (Shift or Timing)
 * @returns {'NEW' | 'WAITING' | 'EDITABLE' | 'FINAL_EDIT' | 'LOCKED'}
 */
export const getItemLockStatus = (lockState, itemKey, itemsOrder = DEFAULT_SHIFTS_3) => {
  if (!lockState || lockState.type === 'neither' || lockState.isUnrestricted) {
    return 'EDITABLE';
  }

  const normKey = normalizeItemKey(itemKey);
  const items = (lockState.items || itemsOrder).map(normalizeItemKey);
  const index = items.indexOf(normKey);

  if (index === -1) return 'EDITABLE';

  const slots = lockState.slots || lockState.lockedSlots || {};
  const slot = slots[normKey] || {};

  // Check legacy lockedShifts representation
  let isSaved = Boolean(
    slot.isSaved ||
    slot.initialSaved ||
    (normKey === 'shift1' && lockState.shift1Saved) ||
    (normKey === 'shift2' && lockState.shift2Saved) ||
    (normKey === 'shift3' && lockState.shift3Saved)
  );

  let editsCount = Number(
    slot.editsCount !== undefined
      ? slot.editsCount
      : slot.editCount !== undefined
      ? slot.editCount
      : normKey === 'shift1'
      ? lockState.shift1Edits || 0
      : normKey === 'shift2'
      ? lockState.shift2Edits || 0
      : normKey === 'shift3'
      ? lockState.shift3Edits || 0
      : 0
  );

  let isLocked = Boolean(
    slot.isLocked ||
    (normKey === 'shift1' && (lockState.shift1Locked || lockState.shift2Saved)) ||
    (normKey === 'shift2' && (lockState.shift2Locked || lockState.shift3Saved)) ||
    (normKey === 'shift3' && (lockState.shift3Locked || (isSaved && editsCount >= 1)))
  );

  if (isSaved && editsCount >= 1) {
    isLocked = true;
  }

  // 1. If predecessor has not been saved yet, this item is WAITING
  if (index > 0) {
    const prevKey = items[index - 1];
    const prevSlot = slots[prevKey] || {};
    const prevSaved = Boolean(
      prevSlot.isSaved ||
      prevSlot.initialSaved ||
      (prevKey === 'shift1' && lockState.shift1Saved) ||
      (prevKey === 'shift2' && lockState.shift2Saved)
    );
    if (!prevSaved) {
      return 'WAITING';
    }
  }

  // 2. If locked, return LOCKED
  if (isLocked) return 'LOCKED';

  // 3. Not saved yet, but predecessor saved -> NEW
  if (!isSaved) return 'NEW';

  // 4. Saved and correction eligible -> FINAL_EDIT (or EDITABLE)
  const isFinalItem = index === items.length - 1;
  const nextKey = index + 1 < items.length ? items[index + 1] : null;
  const nextSlot = nextKey ? slots[nextKey] || {} : null;
  const nextSaved = nextKey
    ? Boolean(
        nextSlot.isSaved ||
        nextSlot.initialSaved ||
        (nextKey === 'shift2' && lockState.shift2Saved) ||
        (nextKey === 'shift3' && lockState.shift3Saved)
      )
    : false;

  if (isFinalItem || !nextSaved) {
    return 'FINAL_EDIT';
  }

  return 'EDITABLE';
};

/**
 * Determines whether inputs for this item/shift should be disabled.
 */
export const isItemDisabled = (lockState, itemKey, itemsOrder = DEFAULT_SHIFTS_3, isViewOnly = false) => {
  if (isViewOnly) return true;
  if (!lockState || lockState.type === 'neither' || lockState.isUnrestricted) return false;

  const status = getItemLockStatus(lockState, itemKey, itemsOrder);
  return status === 'LOCKED' || status === 'WAITING';
};

/**
 * Reusable Status Badge Component
 */
export const LockStatusBadge = ({ status = 'NEW', subLabel }) => {
  const norm = String(status).toUpperCase();

  switch (norm) {
    case 'LOCKED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
          <Lock className="w-2.5 h-2.5 text-rose-600" /> LOCKED
          {subLabel && <span className="opacity-80 lowercase font-normal">({subLabel})</span>}
        </span>
      );
    case 'WAITING':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-2.5 h-2.5 text-amber-600" /> WAITING
          {subLabel && <span className="opacity-80 lowercase font-normal">({subLabel})</span>}
        </span>
      );
    case 'FINAL_EDIT':
    case 'FINAL EDIT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300 animate-pulse">
          <AlertTriangle className="w-2.5 h-2.5 text-purple-600" /> FINAL EDIT
          {subLabel && <span className="opacity-80 lowercase font-normal">({subLabel})</span>}
        </span>
      );
    case 'EDITABLE':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
          <Unlock className="w-2.5 h-2.5 text-blue-600" /> EDITABLE
          {subLabel && <span className="opacity-80 lowercase font-normal">({subLabel})</span>}
        </span>
      );
    case 'NEW':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <Plus className="w-2.5 h-2.5 text-emerald-600" /> NEW
          {subLabel && <span className="opacity-80 lowercase font-normal">({subLabel})</span>}
        </span>
      );
  }
};

/**
 * Reusable EDITED Badge
 */
export const EditedBadge = ({ isEdited }) => {
  if (!isEdited) return null;
  return (
    <span
      className="mt-0.5 inline-flex items-center px-1.5 py-[1px] rounded bg-amber-100 text-amber-900 border border-amber-300 text-[8.5px] font-extrabold uppercase tracking-wider select-none shadow-2xs"
      title="This field value was modified and saved after initial entry"
    >
      EDITED
    </span>
  );
};
