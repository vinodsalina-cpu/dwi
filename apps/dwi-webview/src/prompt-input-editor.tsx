import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import "./prompt-input-editor.css";

export type PromptAssignmentSource = "managed" | "developer";

export interface PromptAssignmentOption {
  id: string;
  name: string;
  promptType: string;
  source: PromptAssignmentSource;
}

export type PromptOutputSize = "low" | "medium" | "high";

export interface PromptInputEditorProps {
  text: string;
  onTextChange(text: string): void;
  assignments: readonly PromptAssignmentOption[];
  assignmentId?: string;
  onAssignmentChange(assignment: PromptAssignmentOption): void;
  outputSize: PromptOutputSize;
  onOutputSizeChange(size: PromptOutputSize): void;
  label?: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}

type OpenMenu = "assignment" | "output";

const OUTPUT_SIZES: readonly { id: PromptOutputSize; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

function sourceLabel(source: PromptAssignmentSource): string {
  return source === "managed" ? "Managed" : "Developer";
}

function moveIndex(current: number, key: string, length: number): number {
  if (length === 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowUp") return (current - 1 + length) % length;
  return current;
}

export function PromptInputEditor({
  text,
  onTextChange,
  assignments,
  assignmentId,
  onAssignmentChange,
  outputSize,
  onOutputSizeChange,
  label = "Prompt",
  placeholder = "Describe the work to optimize…",
  maxLength = 32_768,
  disabled = false,
}: PromptInputEditorProps) {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const assignmentTriggerRef = useRef<HTMLButtonElement>(null);
  const outputTriggerRef = useRef<HTMLButtonElement>(null);
  const assignmentSearchRef = useRef<HTMLInputElement>(null);
  const assignmentListRef = useRef<HTMLDivElement>(null);
  const outputListRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>();
  const [query, setQuery] = useState("");
  const [activeAssignmentIndex, setActiveAssignmentIndex] = useState(0);
  const [activeOutputIndex, setActiveOutputIndex] = useState(0);

  const selectedAssignment = assignments.find(({ id }) => id === assignmentId) ?? assignments[0];
  const selectedOutput = OUTPUT_SIZES.find(({ id }) => id === outputSize) ?? OUTPUT_SIZES[0];
  const searchable = assignments.length > 10;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAssignments = useMemo(() => {
    if (!normalizedQuery) return assignments;
    return assignments.filter((assignment) => [
      assignment.name,
      assignment.promptType,
      sourceLabel(assignment.source),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)));
  }, [assignments, normalizedQuery]);

  const assignmentMenuId = `prompt-assignment-menu-${instanceId}`;
  const assignmentListId = `prompt-assignment-list-${instanceId}`;
  const outputMenuId = `prompt-output-menu-${instanceId}`;
  const outputListId = `prompt-output-list-${instanceId}`;
  const activeAssignmentId = filteredAssignments[activeAssignmentIndex]
    ? `${assignmentListId}-option-${activeAssignmentIndex}`
    : undefined;
  const activeOutputId = `${outputListId}-option-${activeOutputIndex}`;

  useEffect(() => {
    setActiveAssignmentIndex((current) => filteredAssignments.length
      ? Math.min(current, filteredAssignments.length - 1)
      : 0);
  }, [filteredAssignments.length]);

  useEffect(() => {
    if (openMenu === "assignment") {
      if (searchable) assignmentSearchRef.current?.focus();
      else assignmentListRef.current?.focus();
    } else if (openMenu === "output") {
      outputListRef.current?.focus();
    }
  }, [openMenu, searchable]);

  useEffect(() => {
    if (openMenu === "assignment" && activeAssignmentId) {
      document.getElementById(activeAssignmentId)?.scrollIntoView?.({ block: "nearest" });
    } else if (openMenu === "output") {
      document.getElementById(activeOutputId)?.scrollIntoView?.({ block: "nearest" });
    }
  }, [activeAssignmentId, activeOutputId, openMenu]);

  useEffect(() => {
    if (!openMenu) return;

    function closeFromOutside(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) {
        setOpenMenu(undefined);
        setQuery("");
      }
    }

    function closeFromEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const trigger = openMenu === "assignment"
        ? assignmentTriggerRef.current
        : outputTriggerRef.current;
      setOpenMenu(undefined);
      setQuery("");
      window.queueMicrotask(() => trigger?.focus());
    }

    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromEscape, true);
    };
  }, [openMenu]);

  function openAssignmentMenu(): void {
    if (openMenu === "assignment") {
      setOpenMenu(undefined);
      setQuery("");
      return;
    }
    const selectedIndex = assignments.findIndex(({ id }) => id === selectedAssignment?.id);
    setQuery("");
    setActiveAssignmentIndex(Math.max(0, selectedIndex));
    setOpenMenu("assignment");
  }

  function openOutputMenu(): void {
    if (openMenu === "output") {
      setOpenMenu(undefined);
      return;
    }
    setActiveOutputIndex(Math.max(0, OUTPUT_SIZES.findIndex(({ id }) => id === outputSize)));
    setOpenMenu("output");
  }

  function chooseAssignment(assignment: PromptAssignmentOption): void {
    onAssignmentChange(assignment);
    setOpenMenu(undefined);
    setQuery("");
    window.queueMicrotask(() => assignmentTriggerRef.current?.focus());
  }

  function chooseOutput(size: PromptOutputSize): void {
    onOutputSizeChange(size);
    setOpenMenu(undefined);
    window.queueMicrotask(() => outputTriggerRef.current?.focus());
  }

  function handleAssignmentKeys(event: ReactKeyboardEvent<HTMLElement>): void {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveAssignmentIndex((current) => moveIndex(current, event.key, filteredAssignments.length));
      return;
    }
    const searchHasFocus = event.target === assignmentSearchRef.current;
    if (event.key !== "Enter" && (event.key !== " " || searchHasFocus)) return;
    const assignment = filteredAssignments[activeAssignmentIndex];
    if (!assignment) return;
    event.preventDefault();
    chooseAssignment(assignment);
  }

  function handleOutputKeys(event: ReactKeyboardEvent<HTMLElement>): void {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setActiveOutputIndex((current) => moveIndex(current, event.key, OUTPUT_SIZES.length));
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    chooseOutput(OUTPUT_SIZES[activeOutputIndex]?.id ?? "low");
  }

  return <div ref={rootRef} className="prompt-input-editor">
    <textarea
      className="prompt-input-editor__textarea"
      aria-label={label}
      value={text}
      maxLength={maxLength}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => onTextChange(event.target.value)}
    />

    <div className={`prompt-input-editor__control prompt-input-editor__control--assignment${openMenu === "assignment" ? " is-open" : ""}`}>
      <button
        ref={assignmentTriggerRef}
        className="prompt-input-editor__trigger prompt-input-editor__assignment-trigger"
        type="button"
        aria-label={selectedAssignment ? `Assignment: ${selectedAssignment.name}` : "Choose assignment"}
        aria-haspopup="listbox"
        aria-expanded={openMenu === "assignment"}
        aria-controls={assignmentListId}
        title={selectedAssignment
          ? `${selectedAssignment.name} · ${selectedAssignment.promptType} · ${sourceLabel(selectedAssignment.source)}`
          : "Choose an assignment"}
        disabled={disabled || assignments.length === 0}
        onClick={openAssignmentMenu}
      >
        <strong>{selectedAssignment?.name ?? "Choose assignment"}</strong>
        <span className="prompt-input-editor__chevron" aria-hidden="true">⌄</span>
      </button>

      {openMenu === "assignment" && <section
        id={assignmentMenuId}
        className="prompt-input-editor__popover prompt-input-editor__assignment-popover"
        role="dialog"
        aria-label="Choose assignment"
        onKeyDown={handleAssignmentKeys}
      >
        {searchable && <input
          ref={assignmentSearchRef}
          className="prompt-input-editor__search"
          type="search"
          aria-label="Search assignments"
          aria-controls={assignmentListId}
          aria-activedescendant={activeAssignmentId}
          value={query}
          placeholder="Search assignments"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveAssignmentIndex(0);
          }}
        />}
        <div
          ref={assignmentListRef}
          id={assignmentListId}
          className="prompt-input-editor__list"
          role="listbox"
          aria-label="Assignments"
          aria-activedescendant={activeAssignmentId}
          tabIndex={searchable ? -1 : 0}
        >
          {filteredAssignments.map((assignment, index) => <button
            id={`${assignmentListId}-option-${index}`}
            className={`prompt-input-editor__option${index === activeAssignmentIndex ? " active" : ""}`}
            type="button"
            role="option"
            aria-selected={assignment.id === selectedAssignment?.id}
            title={`${assignment.name} · ${assignment.promptType} · ${sourceLabel(assignment.source)}`}
            tabIndex={-1}
            key={assignment.id}
            onPointerMove={() => setActiveAssignmentIndex(index)}
            onClick={() => chooseAssignment(assignment)}
          >
            <span>{assignment.name}</span>
            <small>{assignment.promptType}</small>
          </button>)}
          {filteredAssignments.length === 0 && <div className="prompt-input-editor__empty" role="status">No matching assignments</div>}
        </div>
      </section>}
    </div>

    <div className={`prompt-input-editor__control prompt-input-editor__control--output${openMenu === "output" ? " is-open" : ""}`}>
      <button
        ref={outputTriggerRef}
        className="prompt-input-editor__trigger prompt-input-editor__output-trigger"
        type="button"
        aria-label={`Output size: ${selectedOutput.label}`}
        aria-haspopup="listbox"
        aria-expanded={openMenu === "output"}
        aria-controls={outputListId}
        title={`Output size: ${selectedOutput.label}`}
        disabled={disabled}
        onClick={openOutputMenu}
      >
        <span className="prompt-input-editor__trigger-prefix">Output</span>
        <strong>{selectedOutput.label}</strong>
        <span className="prompt-input-editor__chevron" aria-hidden="true">⌄</span>
      </button>

      {openMenu === "output" && <section
        id={outputMenuId}
        className="prompt-input-editor__popover prompt-input-editor__output-popover"
        role="dialog"
        aria-label="Choose output size"
        onKeyDown={handleOutputKeys}
      >
        <div
          ref={outputListRef}
          id={outputListId}
          className="prompt-input-editor__list prompt-input-editor__output-list"
          role="listbox"
          aria-label="Output sizes"
          aria-activedescendant={activeOutputId}
          tabIndex={0}
        >
          {OUTPUT_SIZES.map((size, index) => <button
            id={`${outputListId}-option-${index}`}
            className={`prompt-input-editor__option${index === activeOutputIndex ? " active" : ""}`}
            type="button"
            role="option"
            aria-selected={size.id === outputSize}
            tabIndex={-1}
            key={size.id}
            onPointerMove={() => setActiveOutputIndex(index)}
            onClick={() => chooseOutput(size.id)}
          >
            <span>{size.label}</span>
          </button>)}
        </div>
      </section>}
    </div>
  </div>;
}
