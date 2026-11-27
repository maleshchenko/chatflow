import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import type { Conversation } from "../../types";

interface Props {
  conversation: Conversation;
  number: number;
  active: boolean;
  playbackPart?: { currentPart: number; totalParts: number } | null;
  onOpen: () => void;
  onRemove: () => void;
}

export default function SortableConversation({
  conversation, number, active, playbackPart, onOpen, onRemove
}: Props) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging
  } = useSortable({ id: conversation.id });

  return (
    <div
      ref={setNodeRef}
      className={`conversation-row ${active ? "is-active" : ""} ${isDragging ? "is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button className="drag-handle" aria-label="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={15} />
      </button>
      <span className="conversation-number">{String(number).padStart(2, "0")}</span>
      <button className="conversation-main" onClick={onOpen} title={conversation.title}>
        <span className="conversation-name">{conversation.title}</span>
        {active && (
          <span className="reading-label">
            {playbackPart ? `PART ${playbackPart.currentPart}/${playbackPart.totalParts}` : "OPEN"}
          </span>
        )}
      </button>
      <button className="remove-button" title="Remove from playlist" onClick={onRemove}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
