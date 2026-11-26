import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, GripVertical, Trash2 } from "lucide-react";
import type { Conversation } from "../../types";

interface Props {
  conversation: Conversation;
  number: number;
  completed: boolean;
  active: boolean;
  onOpen: () => void;
  onToggleCompleted: () => void;
  onRemove: () => void;
}

export default function SortableConversation({
  conversation, number, completed, active, onOpen, onToggleCompleted, onRemove
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
        {active && <span className="reading-label">OPEN</span>}
      </button>
      <button
        className={`complete-button ${completed ? "completed" : ""}`}
        title={completed ? "Mark as not completed" : "Mark as completed"}
        onClick={onToggleCompleted}
      >
        {completed ? <Check size={14} /> : <span />}
      </button>
      <button className="remove-button" title="Remove from playlist" onClick={onRemove}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
