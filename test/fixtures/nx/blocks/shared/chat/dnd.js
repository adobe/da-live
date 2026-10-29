export function createFileDropHandlers({ isAllowed, onDragging, onFiles }) {
  return {
    onDragEnter(event) {
      event.preventDefault();
      onDragging(true);
    },
    onDragLeave(event) {
      if (!event.currentTarget.contains(event.relatedTarget)) onDragging(false);
    },
    onDragOver(event) {
      event.preventDefault();
    },
    async onDrop(event) {
      event.preventDefault();
      onDragging(false);
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) await onFiles(isAllowed ? files.filter(isAllowed) : files);
    },
  };
}
