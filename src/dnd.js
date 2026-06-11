// Shared folder drag-and-drop reorder. The handlers + array-splice were
// duplicated nearly verbatim between TargetsView's FolderCard and
// RollChrome's TargetGroup (~75 lines); this is their one home so a future
// DnD fix can't land in only one copy.

import { useState } from 'react';

// Pure array move: new array with the item at `from` reinserted at `to`.
// Out-of-range indices (or from === to) return the array unchanged.
export function reorderItem(arr, from, to) {
  if (from === to) return arr;
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

// Custom MIME type so a text drag out of a folder-name input doesn't trip the
// drop-target styling.
const MIME = 'application/grimoire-folder-index';

// Folder drag-reorder. Returns `{ dragging, dragOver, enabled }` plus two prop
// bundles to spread:
//   handleProps   → the drag handle (the only `draggable` element, so dragging
//                   from a name input doesn't drag the input's text)
//   dropZoneProps → the card container (the drop target)
// A null/absent `onReorder` yields a disabled, inert state — how the pinned
// Ungrouped section opts out of being draggable.
export function useFolderDragReorder({ index, onReorder }) {
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const enabled = typeof onReorder === 'function' && typeof index === 'number';

  if (!enabled) {
    return { dragging: false, dragOver: false, enabled: false, handleProps: {}, dropZoneProps: {} };
  }

  const handleProps = {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(MIME, String(index));
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
      setDragging(true);
    },
    onDragEnd: () => { setDragging(false); setDragOver(false); },
  };

  const dropZoneProps = {
    onDragOver: (e) => {
      if (![...e.dataTransfer.types].includes(MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (e) => {
      setDragOver(false);
      const raw = e.dataTransfer.getData(MIME);
      if (raw === '') return;
      const from = parseInt(raw, 10);
      if (Number.isNaN(from)) return;
      e.preventDefault();
      onReorder(from, index);
    },
  };

  return { dragging, dragOver, enabled: true, handleProps, dropZoneProps };
}
