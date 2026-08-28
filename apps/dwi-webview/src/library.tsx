import React, {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  EMPTY_PROMPT_DRAFT_FIELDS,
  PROMPT_GUIDANCE_PACKS,
} from "@platform/domain-prompt-optimizer/catalog";
import {
  PROMPT_TEXT_LIMIT_CHARS,
  promptTypes,
  type PromptDraftFields,
  type PromptGuidancePackId,
  type PromptTemplate,
  type PromptTemplateInput,
} from "@platform/domain-prompt-optimizer/types";
import "./library.css";

export type LibraryKind = "template" | "skill" | "rule" | "other";
export type LibrarySource = "managed" | "personal";
export type LibraryHomeTab = "recents" | "review";
export type LibraryFeedbackRating = "helpful" | "mixed" | "not-helpful";

export interface LibraryKindOption {
  kind: LibraryKind;
  label: string;
  available: boolean;
}

export interface LibraryItemSummary {
  id: string;
  name: string;
  kind: LibraryKind;
  source: LibrarySource;
  reviewedAt?: string;
  updatedAt?: string;
  promptType?: string;
}

export interface LibraryTemplateVersion {
  revision: number;
  updatedAt: string;
  label?: string;
}

export interface LibraryTemplateDetail {
  item: LibraryItemSummary;
  template: PromptTemplate;
  revision: number;
  versions: LibraryTemplateVersion[];
}

export interface LibraryState {
  status: "loading" | "ready" | "error";
  kinds: LibraryKindOption[];
  recents: LibraryItemSummary[];
  managedTemplates: LibraryItemSummary[];
  personalTemplates: LibraryItemSummary[];
  error?: string;
}

export type LibraryRoute =
  | { view: "home"; tab: LibraryHomeTab; kind: LibraryKind }
  | { view: "reader"; item: LibraryItemSummary; from: { tab: LibraryHomeTab; kind: LibraryKind } }
  | { view: "editor"; mode: "create" | "edit"; item?: LibraryItemSummary; from: { tab: LibraryHomeTab; kind: LibraryKind } };

export interface LibrarySaveRequest {
  operationId: string;
  expectedRevision?: number;
  template: PromptTemplateInput;
}

export interface LibraryDeleteRequest {
  operationId: string;
  expectedRevision: number;
  templateId: string;
}

export interface LibraryFeedbackRequest {
  operationId: string;
  expectedRevision: number;
  templateId: string;
  rating: LibraryFeedbackRating;
  stars: number;
  note: string;
}

export interface LibraryCloneRequest {
  operationId: string;
}

export interface LibraryClonePasteRequest extends LibraryCloneRequest {
  text: string;
}

export type LibraryCloneResult =
  | { operationId: string; status: "ready"; template: PromptTemplateInput }
  | { operationId: string; status: "invalid"; message: string; template?: never };

export type LibraryEditorDocument =
  | { kind: "library" }
  | { kind: "guidance"; guidanceId: PromptGuidancePackId };

export interface LibraryWorkspaceProps {
  state: LibraryState;
  detail?: LibraryTemplateDetail;
  route?: LibraryRoute;
  initialRoute?: LibraryRoute;
  cloneResult?: LibraryCloneResult;
  onRouteChange?(route: LibraryRoute): void;
  onOpen?(): void | Promise<void>;
  onReload?(): void | Promise<void>;
  onRequestDetail?(request: { templateId: string }): void | LibraryTemplateDetail | Promise<void | LibraryTemplateDetail>;
  onCreate?(kind: LibraryKind): void;
  onSave?(request: LibrarySaveRequest): void | LibraryTemplateDetail | Promise<void | LibraryTemplateDetail>;
  onDelete?(request: LibraryDeleteRequest): void | Promise<void>;
  onFeedback?(request: LibraryFeedbackRequest): void | Promise<void>;
  onCloneFile?(request: LibraryCloneRequest): void | LibraryCloneResult | Promise<void | LibraryCloneResult>;
  onClonePaste?(request: LibraryClonePasteRequest): void | LibraryCloneResult | Promise<void | LibraryCloneResult>;
  onOpenDocument?(document: LibraryEditorDocument): void;
}

export const EMPTY_LIBRARY_STATE: LibraryState = {
  status: "loading",
  kinds: [{ kind: "template", label: "Templates", available: true }],
  recents: [],
  managedTemplates: [],
  personalTemplates: [],
};

const DEFAULT_ROUTE: LibraryRoute = { view: "home", tab: "recents", kind: "template" };
let operationSequence = 0;

function operationId(prefix: string): string {
  operationSequence += 1;
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${operationSequence}`;
  return `${prefix}-${suffix}`;
}

function itemKey(item: LibraryItemSummary): string {
  return `${item.kind}:${item.source}:${item.id}`;
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recentlyReviewed(items: readonly LibraryItemSummary[]): LibraryItemSummary[] {
  return [...items].sort((left, right) =>
    timestamp(right.reviewedAt ?? right.updatedAt) - timestamp(left.reviewedAt ?? left.updatedAt) || left.name.localeCompare(right.name),
  );
}

function friendlyDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

type LibraryIconName = "back" | "book" | "check" | "chevron" | "clone" | "close" | "delete" | "edit" | "file" | "info" | "plus" | "search" | "star";

function LibraryIcon({ name, size = 16 }: { name: LibraryIconName; size?: number }) {
  const paths: Record<LibraryIconName, React.ReactNode> = {
    back: <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z" fill="currentColor" stroke="none" />,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5Z" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
    chevron: <path d="m8 10 4 4 4-4" />,
    clone: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    close: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
    delete: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
    file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
    star: <path d="M12 2l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 2z" />,
  };
  return <svg className="library-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

interface DismissibleLayerProps {
  id?: string;
  label: string;
  triggerRef: { current: HTMLElement | null };
  role?: "dialog" | "menu";
  initialFocus?: "first" | "last";
  className?: string;
  onClose(): void;
  children: React.ReactNode;
}

function DismissibleLayer({ id, label, triggerRef, role = "dialog", initialFocus = "first", className = "", onClose, children }: DismissibleLayerProps) {
  const layerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const layer = layerRef.current;
    const controls = Array.from(layer?.querySelectorAll<HTMLElement>(
      role === "menu"
        ? '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])'
        : "[data-autofocus], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
    ) ?? []);
    const initialControl = initialFocus === "last" ? controls.at(-1) : controls[0];
    (initialControl ?? layer)?.focus();

    function close(returnFocus: boolean): void {
      closeRef.current();
      if (returnFocus) queueMicrotask(() => triggerRef.current?.focus());
    }

    function onPointerDown(event: PointerEvent): void {
      const target = event.target as Node;
      if (layerRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      }
      if (role !== "menu" || !layerRef.current?.contains(event.target as Node) || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(layerRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])'));
      if (!items.length) return;
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : event.key === "ArrowDown" ? (currentIndex + 1 + items.length) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    }

    function onFocusIn(event: FocusEvent): void {
      const target = event.target as Node;
      if (layerRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [initialFocus, role, triggerRef]);

  return <section ref={layerRef} id={id} className={`library-popover ${className}`.trim()} role={role} aria-label={label} tabIndex={-1}>{children}</section>;
}

function KindBadge({ kind }: { kind: LibraryKind }) {
  const label = kind === "template" ? "Template" : kind === "skill" ? "Skill" : kind === "rule" ? "Rule" : "Other";
  return <span className="library-kind" data-kind={kind}>{label}</span>;
}

interface LibraryHomeProps {
  route: Extract<LibraryRoute, { view: "home" }>;
  state: LibraryState;
  onRoute(route: LibraryRoute): void;
  onOpenItem(item: LibraryItemSummary): void;
  onCreate(kind: LibraryKind): void;
  onReload?(): void | Promise<void>;
  onOpenDocument(document: LibraryEditorDocument): void;
}

function LibraryHome({ route, state, onRoute, onOpenItem, onCreate, onReload, onOpenDocument }: LibraryHomeProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addInitialFocus, setAddInitialFocus] = useState<"first" | "last">("first");
  const addRef = useRef<HTMLButtonElement>(null);
  const addId = useId();
  const availableKinds = state.kinds.length ? state.kinds : EMPTY_LIBRARY_STATE.kinds;
  const activeKind = availableKinds.some(({ kind, available }) => kind === route.kind && available)
    ? route.kind
    : availableKinds.find(({ available }) => available)?.kind ?? "template";

  function switchTab(tab: LibraryHomeTab): void {
    onRoute({ view: "home", tab, kind: activeKind });
  }

  function moveTab(event: React.KeyboardEvent<HTMLButtonElement>, tab: LibraryHomeTab): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "recents" ? "review" : "recents";
    switchTab(next);
    queueMicrotask(() => document.getElementById(`library-tab-${next}`)?.focus());
  }

  return <section className="library-surface library-home" aria-label="Library">
    <header className="library-header">
      <div className="library-heading">
        <span className="library-eyebrow">Developer assets</span>
        <div className="library-title-line"><h1>Library</h1><span className="library-info-anchor"><button type="button" className="library-icon-button subtle" aria-label="Open Library information in editor" onClick={() => onOpenDocument({ kind: "library" })}><LibraryIcon name="info" size={14} /></button></span></div>
      </div>
      <div className="library-add-anchor">
        <button ref={addRef} type="button" className="library-icon-button emphasized" aria-label="Create library item" aria-haspopup="menu" aria-expanded={addOpen} aria-controls={addId} onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setAddInitialFocus(event.key === "ArrowUp" ? "last" : "first");
          setAddOpen(true);
        }} onClick={() => { setAddInitialFocus("first"); setAddOpen((open) => !open); }}><LibraryIcon name="plus" /></button>
        {addOpen && <DismissibleLayer id={addId} label="Create library item" role="menu" initialFocus={addInitialFocus} triggerRef={addRef} className="library-create-menu" onClose={() => setAddOpen(false)}><button type="button" role="menuitem" onClick={() => { setAddOpen(false); onCreate("template"); }}><LibraryIcon name="file" size={14} />Template</button></DismissibleLayer>}
      </div>
    </header>

    <div className="library-tabs" role="tablist" aria-label="Library views">
      {(["recents", "review"] as const).map((tab) => <button id={`library-tab-${tab}`} key={tab} type="button" role="tab" aria-selected={route.tab === tab} tabIndex={route.tab === tab ? 0 : -1} onClick={() => switchTab(tab)} onKeyDown={(event) => moveTab(event, tab)}>{tab === "recents" ? "Recents" : "Review"}</button>)}
    </div>

    {state.status === "loading" && <div className="library-loading" role="status"><span />Loading library…</div>}
    {state.status === "error" && <div className="library-error" role="alert"><strong>Library unavailable</strong><span>{state.error ?? "Try loading the library again."}</span>{onReload && <button type="button" onClick={() => void onReload()}>Retry</button>}</div>}

    {state.status === "ready" && route.tab === "recents" && <section id="library-panel-recents" className="library-tab-panel" role="tabpanel" aria-labelledby="library-tab-recents">
      {state.recents.length === 0
        ? <div className="library-empty"><LibraryIcon name="book" size={20} /><strong>No reviewed items yet</strong></div>
        : <ul className="library-recent-list" aria-label="Recently reviewed library items">{recentlyReviewed(state.recents).map((item) => <li key={itemKey(item)}><button type="button" data-library-key={itemKey(item)} onClick={() => onOpenItem(item)}><span className="library-row-name" title={item.name}>{item.name}</span><KindBadge kind={item.kind} /></button></li>)}</ul>}
    </section>}

    {state.status === "ready" && route.tab === "review" && <section id="library-panel-review" className="library-tab-panel library-review" role="tabpanel" aria-labelledby="library-tab-review">
      <div className="library-kind-switcher" role="group" aria-label="Asset kind">{availableKinds.map((option) => <button key={option.kind} type="button" disabled={!option.available} aria-pressed={activeKind === option.kind} title={option.available ? undefined : `${option.label} are not available yet`} onClick={() => onRoute({ view: "home", tab: "review", kind: option.kind })}>{option.label}</button>)}</div>
      {activeKind === "template" ? <div className="library-review-panes">
        <ReviewPane title="Managed templates" source="managed" items={state.managedTemplates} onOpenItem={onOpenItem} />
        <ReviewPane title="Personal templates" source="personal" items={state.personalTemplates} onOpenItem={onOpenItem} />
      </div> : <div className="library-empty"><KindBadge kind={activeKind} /><strong>No {activeKind} items available</strong></div>}
    </section>}
  </section>;
}

function ReviewPane({ title, source, items, onOpenItem }: { title: string; source: LibrarySource; items: LibraryItemSummary[]; onOpenItem(item: LibraryItemSummary): void }) {
  return <article className="library-review-pane" data-source={source}>
    <header><h2>{title}</h2><span className="library-count" aria-label={`${items.length} ${title.toLowerCase()}`}>{items.length}</span></header>
    <div className="library-pane-scroll">
      {items.length === 0
        ? <div className="library-pane-empty">None yet</div>
        : <ul aria-label={title}>{recentlyReviewed(items).map((item) => <li key={itemKey(item)}><button type="button" data-library-key={itemKey(item)} title={item.name} onClick={() => onOpenItem(item)}>{item.name}</button></li>)}</ul>}
    </div>
  </article>;
}

function ReaderSection({ label, value, code = false }: { label: string; value: string; code?: boolean }) {
  if (!value.trim()) return null;
  return <section className="library-reader-section"><h2>{label}</h2>{code ? <pre tabIndex={0}>{value}</pre> : <p>{value}</p>}</section>;
}

interface LibraryReaderProps {
  route: Extract<LibraryRoute, { view: "reader" }>;
  detail?: LibraryTemplateDetail;
  loadError?: string;
  onBack(): void;
  onEdit(): void;
  onDelete(request: LibraryDeleteRequest): void | Promise<void>;
  onFeedback(request: LibraryFeedbackRequest): void | Promise<void>;
}

function LibraryReader({ route, detail, loadError, onBack, onEdit, onDelete, onFeedback }: LibraryReaderProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"feedback" | "delete">();
  const [error, setError] = useState("");
  const feedbackRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const feedbackRetryRef = useRef<{ operationId: string; signature: string } | undefined>(undefined);
  const feedbackId = useId();
  const deleteId = useId();
  const isManaged = route.item.source === "managed";
  const detailReady = detail?.item.id === route.item.id;

  async function submitFeedback(): Promise<void> {
    if (!detail || stars < 1) return;
    const trimmedNote = note.trim();
    const signature = `${stars}\u0000${trimmedNote}`;
    const retry = feedbackRetryRef.current?.signature === signature
      ? feedbackRetryRef.current
      : { operationId: operationId("library-feedback"), signature };
    feedbackRetryRef.current = retry;
    setBusy("feedback");
    setError("");
    try {
      await onFeedback({
        operationId: retry.operationId,
        expectedRevision: detail.revision,
        templateId: detail.template.id,
        rating: stars <= 2 ? "not-helpful" : stars === 3 ? "mixed" : "helpful",
        stars,
        note: trimmedNote,
      });
      feedbackRetryRef.current = undefined;
      setFeedbackOpen(false);
      setStars(0);
      setNote("");
      queueMicrotask(() => feedbackRef.current?.focus());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback could not be sent.");
    } finally {
      setBusy(undefined);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (!detail) return;
    setBusy("delete");
    setError("");
    try {
      await onDelete({ operationId: operationId("library-delete"), expectedRevision: detail.revision, templateId: detail.template.id });
      setDeleteOpen(false);
      onBack();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template could not be deleted.");
    } finally {
      setBusy(undefined);
    }
  }

  function moveStarRating(event: React.KeyboardEvent<HTMLButtonElement>, value: number): void {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 1
      : event.key === "End" ? 5
        : event.key === "ArrowRight" || event.key === "ArrowDown" ? (value % 5) + 1
          : ((value + 3) % 5) + 1;
    setStars(next);
    starRefs.current[next - 1]?.focus();
  }

  return <section className="library-surface library-reader" aria-label={`${route.item.name} reader`}>
    <header className="library-reader-header">
      <button type="button" className="library-icon-button" data-library-route-focus aria-label="Back to Library" onClick={onBack}><LibraryIcon name="back" /></button>
      <div><span className="library-kind" data-kind="template">{isManaged ? "Managed" : "Personal"}</span><h1>{route.item.name}</h1></div>
      <div className="library-reader-actions">
        {!detailReady ? <span className="library-reader-action-status" aria-hidden="true">Loading…</span>
          : isManaged ? <span className="library-action-anchor"><button ref={feedbackRef} type="button" className="library-secondary-button" aria-expanded={feedbackOpen} aria-controls={feedbackId} onClick={() => setFeedbackOpen((open) => !open)}><LibraryIcon name="star" size={14} />Feedback</button>{feedbackOpen && <DismissibleLayer id={feedbackId} label="Template feedback" triggerRef={feedbackRef} className="library-feedback-popover" onClose={() => setFeedbackOpen(false)}><strong>Rate this managed template</strong><div className="library-stars" role="radiogroup" aria-label="Rating">{[1, 2, 3, 4, 5].map((value) => <button ref={(element) => { starRefs.current[value - 1] = element; }} key={value} type="button" role="radio" aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-checked={stars === value} data-filled={stars >= value} tabIndex={stars === value || (stars === 0 && value === 1) ? 0 : -1} onKeyDown={(event) => moveStarRating(event, value)} onClick={() => setStars(value)}><LibraryIcon name="star" size={17} /></button>)}</div><label>Feedback<textarea value={note} maxLength={1000} rows={4} placeholder="Optional" onChange={(event) => setNote(event.target.value)} /></label><div className="library-popover-actions"><button type="button" className="library-primary-button" disabled={stars < 1 || busy === "feedback"} onClick={() => void submitFeedback()}>{busy === "feedback" ? "Sending…" : "Send feedback"}</button></div></DismissibleLayer>}</span>
          : <><button type="button" className="library-secondary-button" onClick={onEdit}><LibraryIcon name="edit" size={14} />Edit</button><span className="library-action-anchor"><button ref={deleteRef} type="button" className="library-icon-button library-danger-icon" aria-label="Delete template" aria-expanded={deleteOpen} aria-controls={deleteId} onClick={() => setDeleteOpen((open) => !open)}><LibraryIcon name="delete" /></button>{deleteOpen && <DismissibleLayer id={deleteId} label="Delete template" triggerRef={deleteRef} className="library-confirm-popover" onClose={() => setDeleteOpen(false)}><strong>Delete “{route.item.name}”?</strong><p>This removes the local copy and registers the deletion for backup history.</p><div className="library-popover-actions"><button type="button" onClick={() => { setDeleteOpen(false); queueMicrotask(() => deleteRef.current?.focus()); }}>Cancel</button><button type="button" className="library-danger-button" disabled={busy === "delete"} onClick={() => void confirmDelete()}>{busy === "delete" ? "Deleting…" : "Delete"}</button></div></DismissibleLayer>}</span></>}
      </div>
    </header>
    {error && <div className="library-error compact" role="alert">{error}</div>}
    {!detail || detail.item.id !== route.item.id ? loadError
      ? <div className="library-error" role="alert"><strong>Template unavailable</strong><span>{loadError}</span><button type="button" onClick={onBack}>Back to Library</button></div>
      : <div className="library-loading reader-loading" role="status"><span />Loading template…</div> : <div className="library-reader-scroll">
      {detail.template.description && <ReaderSection label="Overview" value={detail.template.description} />}
      <ReaderSection label="Base instruction" value={detail.template.prompt} code />
      <ReaderSection label="Desired outcome" value={detail.template.fields.desiredOutcome} />
      <ReaderSection label="In scope" value={detail.template.fields.inScope} />
      <ReaderSection label="Out of scope" value={detail.template.fields.outOfScope} />
      <ReaderSection label="Hard constraints" value={detail.template.fields.hardConstraints} />
      <ReaderSection label="Acceptance criteria" value={detail.template.fields.acceptanceCriteria} />
      <ReaderSection label="Verification" value={detail.template.fields.verification} />
      <ReaderSection label="Output format" value={detail.template.fields.outputFormat} />
      {detail.template.recommendedGuidancePackIds.length > 0 && <section className="library-reader-section"><h2>Guidance</h2><div className="library-guidance-chips">{detail.template.recommendedGuidancePackIds.map((id) => <span key={id}>{PROMPT_GUIDANCE_PACKS.find((pack) => pack.id === id)?.label ?? id}</span>)}</div></section>}
    </div>}
  </section>;
}

function emptyTemplateInput(): PromptTemplateInput {
  return {
    name: "",
    description: "",
    promptType: "General",
    prompt: "",
    fields: { ...EMPTY_PROMPT_DRAFT_FIELDS },
    recommendedGuidancePackIds: [],
  };
}

function templateInputFromDetail(detail: LibraryTemplateDetail | undefined): PromptTemplateInput {
  if (!detail) return emptyTemplateInput();
  return {
    templateId: detail.template.id,
    name: detail.template.name,
    description: detail.template.description,
    promptType: detail.template.promptType,
    prompt: detail.template.prompt,
    fields: { ...detail.template.fields },
    recommendedGuidancePackIds: [...detail.template.recommendedGuidancePackIds],
  };
}

function GuidanceChoice({ id, checked, onChange, onOpenDocument }: { id: PromptGuidancePackId; checked: boolean; onChange(): void; onOpenDocument(document: LibraryEditorDocument): void }) {
  const pack = PROMPT_GUIDANCE_PACKS.find((item) => item.id === id)!;
  return <div className="library-guidance-choice">
    <label><input type="checkbox" checked={checked} onChange={onChange} /><span>{pack.label}</span></label>
    <span className="library-info-anchor"><button type="button" className="library-icon-button subtle" aria-label={`Open information about ${pack.label} in editor`} onClick={() => onOpenDocument({ kind: "guidance", guidanceId: pack.id })}><LibraryIcon name="info" size={13} /></button></span>
  </div>;
}

type CloneStage = "closed" | "menu" | "file" | "paste" | "invalid" | "replace";

interface TemplateEditorProps {
  route: Extract<LibraryRoute, { view: "editor" }>;
  detail?: LibraryTemplateDetail;
  cloneResult?: LibraryCloneResult;
  onBack(): void;
  onSave(request: LibrarySaveRequest): void | LibraryTemplateDetail | Promise<void | LibraryTemplateDetail>;
  onSaved(detail?: LibraryTemplateDetail): void;
  onCloneFile(request: LibraryCloneRequest): void | LibraryCloneResult | Promise<void | LibraryCloneResult>;
  onClonePaste(request: LibraryClonePasteRequest): void | LibraryCloneResult | Promise<void | LibraryCloneResult>;
  onOpenDocument(document: LibraryEditorDocument): void;
}

function TemplateEditor({ route, detail, cloneResult, onBack, onSave, onSaved, onCloneFile, onClonePaste, onOpenDocument }: TemplateEditorProps) {
  const [baseRevision] = useState(() => route.mode === "edit" ? detail?.revision : undefined);
  const [initialDraft] = useState<PromptTemplateInput>(() => templateInputFromDetail(route.mode === "edit" ? detail : undefined));
  const [draft, setDraft] = useState<PromptTemplateInput>(() => ({ ...initialDraft, fields: { ...initialDraft.fields }, recommendedGuidancePackIds: [...initialDraft.recommendedGuidancePackIds] }));
  const [saveOpen, setSaveOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [cloneStage, setCloneStage] = useState<CloneStage>("closed");
  const [cloneInitialFocus, setCloneInitialFocus] = useState<"first" | "last">("first");
  const [cloneReturnStage, setCloneReturnStage] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [cloneMessage, setCloneMessage] = useState("");
  const [pendingCloneTemplate, setPendingCloneTemplate] = useState<PromptTemplateInput>();
  const [cloneBusy, setCloneBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState("");
  const activeCloneOperation = useRef("");
  const seenCloneResult = useRef("");
  const backRef = useRef<HTMLButtonElement>(null);
  const cloneRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const cloneId = useId();
  const discardId = useId();
  const saveId = useId();
  const versionRows = useMemo(() => {
    const versions = detail?.versions.length
      ? detail.versions
      : detail ? [{ revision: detail.revision, updatedAt: detail.template.updatedAt ?? detail.template.createdAt ?? "Current", label: "Current" }] : [];
    return [...versions].sort((left, right) => right.revision - left.revision).slice(0, 5);
  }, [detail]);
  const templateCharacters = draft.prompt.length + Object.values(draft.fields).reduce((total, value) => total + value.length, 0);
  const withinTemplateLimit = templateCharacters <= PROMPT_TEXT_LIMIT_CHARS;
  const revisionChanged = route.mode === "edit" && baseRevision !== undefined && detail?.revision !== undefined && detail.revision !== baseRevision;
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const readyToSave = Boolean(
    draft.name.trim() &&
    draft.prompt.trim() &&
    draft.fields.desiredOutcome.trim() &&
    draft.fields.acceptanceCriteria.trim() &&
    draft.fields.verification.trim() &&
    withinTemplateLimit &&
    !revisionChanged,
  );

  function useClonedTemplate(template: PromptTemplateInput): void {
    setDraft({ ...template, fields: { ...template.fields }, recommendedGuidancePackIds: [...template.recommendedGuidancePackIds] });
    setPendingCloneTemplate(undefined);
    setCloneStage("closed");
    setCloneMessage("");
    queueMicrotask(() => cloneRef.current?.focus());
  }

  function applyCloneResult(result: LibraryCloneResult): void {
    if (result.operationId !== activeCloneOperation.current || result.operationId === seenCloneResult.current) return;
    seenCloneResult.current = result.operationId;
    setCloneBusy(false);
    if (result.status === "ready") {
      if (isDirty) {
        setPendingCloneTemplate(result.template);
        setCloneStage("replace");
      } else useClonedTemplate(result.template);
      return;
    }
    setCloneMessage(result.message);
    setCloneStage("invalid");
  }

  useEffect(() => {
    if (cloneResult) applyCloneResult(cloneResult);
  }, [cloneResult]);

  function setField(field: keyof PromptDraftFields, value: string): void {
    setDraft((current) => ({ ...current, fields: { ...current.fields, [field]: value } }));
  }

  function toggleGuidance(id: PromptGuidancePackId): void {
    setDraft((current) => ({
      ...current,
      recommendedGuidancePackIds: current.recommendedGuidancePackIds.includes(id)
        ? current.recommendedGuidancePackIds.filter((item) => item !== id)
        : [...current.recommendedGuidancePackIds, id],
    }));
  }

  async function chooseCloneFile(): Promise<void> {
    const id = operationId("library-clone-file");
    activeCloneOperation.current = id;
    setCloneReturnStage("file");
    setCloneBusy(true);
    setCloneMessage("");
    try {
      const result = await onCloneFile({ operationId: id });
      if (result) applyCloneResult(result);
      else setCloneBusy(false);
    } catch (caught) {
      setCloneBusy(false);
      setCloneMessage(caught instanceof Error ? caught.message : "The selected file could not be used.");
      setCloneStage("invalid");
    }
  }

  async function validatePaste(): Promise<void> {
    const id = operationId("library-clone-paste");
    activeCloneOperation.current = id;
    setCloneReturnStage("paste");
    setCloneBusy(true);
    setCloneMessage("");
    try {
      const result = await onClonePaste({ operationId: id, text: pasteText });
      if (result) applyCloneResult(result);
      else setCloneBusy(false);
    } catch (caught) {
      setCloneBusy(false);
      setCloneMessage(caught instanceof Error ? caught.message : "The pasted response could not be used.");
      setCloneStage("invalid");
    }
  }

  async function confirmSave(): Promise<void> {
    if (!readyToSave) return;
    setSaveBusy(true);
    setError("");
    try {
      const saved = await onSave({
        operationId: operationId("library-save"),
        expectedRevision: route.mode === "edit" ? baseRevision : undefined,
        template: { ...draft, fields: { ...draft.fields }, recommendedGuidancePackIds: [...draft.recommendedGuidancePackIds] },
      });
      setSaveOpen(false);
      onSaved(saved || undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Template could not be saved.");
      setSaveOpen(false);
      queueMicrotask(() => saveRef.current?.focus());
    } finally {
      setSaveBusy(false);
    }
  }

  const cloneLayer = cloneStage !== "closed" && <DismissibleLayer key={cloneStage} id={cloneId} label={cloneStage === "menu" ? "Clone options" : cloneStage === "invalid" ? "Invalid clone input" : cloneStage === "replace" ? "Replace template draft" : cloneStage === "file" ? "Append file" : "Paste AI response"} role={cloneStage === "menu" ? "menu" : "dialog"} initialFocus={cloneInitialFocus} triggerRef={cloneRef} className={`library-clone-popover stage-${cloneStage}`} onClose={() => { if (cloneStage === "replace") setPendingCloneTemplate(undefined); setCloneStage(cloneStage === "invalid" || cloneStage === "replace" ? cloneReturnStage : "closed"); }}>
    {cloneStage === "menu" && <><button type="button" role="menuitem" onClick={() => { setCloneInitialFocus("first"); setCloneReturnStage("file"); setCloneStage("file"); }}><LibraryIcon name="file" size={14} />Append file</button><button type="button" role="menuitem" onClick={() => { setCloneInitialFocus("first"); setCloneReturnStage("paste"); setCloneStage("paste"); }}>Paste AI response</button></>}
    {cloneStage === "file" && <><strong>Append a template source</strong><button type="button" className="library-secondary-button full" disabled={cloneBusy} onClick={() => void chooseCloneFile()}><LibraryIcon name="file" size={14} />{cloneBusy ? "Choosing…" : "Choose file"}</button></>}
    {cloneStage === "paste" && <><strong>Paste a structured AI response</strong><label>AI response<textarea value={pasteText} maxLength={131072} rows={7} onChange={(event) => setPasteText(event.target.value)} /></label><div className="library-popover-actions"><button type="button" className="library-primary-button" disabled={!pasteText.trim() || cloneBusy} onClick={() => void validatePaste()}>{cloneBusy ? "Checking…" : "Use response"}</button></div></>}
    {cloneStage === "invalid" && <><strong>That source is not a valid template</strong><p>{cloneMessage || "Use a supported template file or structured AI response."}</p><div className="library-popover-actions"><button type="button" data-autofocus onClick={() => setCloneStage(cloneReturnStage)}>Back</button></div></>}
    {cloneStage === "replace" && <><strong>Replace unsaved editor changes?</strong><p>The cloned template will replace the current draft.</p><div className="library-popover-actions"><button type="button" data-autofocus onClick={() => { setPendingCloneTemplate(undefined); setCloneStage(cloneReturnStage); }}>Keep current</button><button type="button" className="library-danger-button" disabled={!pendingCloneTemplate} onClick={() => pendingCloneTemplate && useClonedTemplate(pendingCloneTemplate)}>Replace</button></div></>}
  </DismissibleLayer>;

  return <section className="library-surface library-editor" aria-label={route.mode === "create" ? "Create template" : `Edit ${route.item?.name ?? "template"}`}>
    <header className="library-editor-header">
      <div className="library-editor-leading"><span className="library-action-anchor"><button ref={backRef} type="button" className="library-icon-button" aria-label={route.mode === "edit" ? "Back to template" : "Back to Library"} aria-expanded={discardOpen} aria-controls={discardId} onClick={() => isDirty ? setDiscardOpen(true) : onBack()}><LibraryIcon name="back" /></button>{discardOpen && <DismissibleLayer id={discardId} label="Discard template changes" triggerRef={backRef} className="library-confirm-popover library-discard-popover" onClose={() => setDiscardOpen(false)}><strong>Discard unsaved changes?</strong><p>Your current editor changes will be lost.</p><div className="library-popover-actions"><button type="button" data-autofocus onClick={() => { setDiscardOpen(false); queueMicrotask(() => backRef.current?.focus()); }}>Keep editing</button><button type="button" className="library-danger-button" onClick={onBack}>Discard</button></div></DismissibleLayer>}</span><span className="library-action-anchor"><button ref={cloneRef} type="button" className="library-secondary-button" aria-label="Clone" aria-haspopup="menu" aria-expanded={cloneStage !== "closed"} aria-controls={cloneId} onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        setCloneInitialFocus(event.key === "ArrowUp" ? "last" : "first");
        setCloneStage("menu");
      }} onClick={() => { setCloneInitialFocus("first"); setCloneStage(cloneStage === "closed" ? "menu" : "closed"); }}><LibraryIcon name="clone" size={14} /><span className="library-clone-label">Clone</span><span className="library-clone-chevron"><LibraryIcon name="chevron" size={13} /></span></button>{cloneLayer}</span></div>
      <div className="library-editor-title"><span className="library-eyebrow">Personal template</span><h1>{route.mode === "create" ? "Create template" : "Edit template"}</h1></div>
    </header>
    {(revisionChanged || error) && <div className="library-error compact" role="alert">{revisionChanged ? <><strong>A newer version is available</strong><span>Review it before applying these draft changes.</span><button type="button" onClick={onBack}>Review latest</button></> : error}</div>}
    <div className="library-editor-scroll">
      <section className="library-form-section" aria-labelledby="library-form-identity"><h2 id="library-form-identity">Identity</h2><div className="library-form-grid two-columns"><label>Name <span aria-hidden="true">*</span><input data-library-route-focus value={draft.name} maxLength={200} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Type <select value={draft.promptType} onChange={(event) => setDraft({ ...draft, promptType: event.target.value as PromptTemplateInput["promptType"] })}>{promptTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label></div><label>Description<textarea value={draft.description} maxLength={2000} rows={3} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><label>Template title<input value={draft.fields.title} maxLength={PROMPT_TEXT_LIMIT_CHARS} onChange={(event) => setField("title", event.target.value)} /></label></section>

      <section className="library-form-section" aria-labelledby="library-form-task"><h2 id="library-form-task">Task definition</h2><label>Base instruction <span aria-hidden="true">*</span><textarea value={draft.prompt} maxLength={PROMPT_TEXT_LIMIT_CHARS} rows={7} required onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} /></label><label>Desired outcome <span aria-hidden="true">*</span><textarea value={draft.fields.desiredOutcome} maxLength={PROMPT_TEXT_LIMIT_CHARS} rows={4} required onChange={(event) => setField("desiredOutcome", event.target.value)} /></label></section>

      <section className="library-form-section" aria-labelledby="library-form-scope"><h2 id="library-form-scope">Scope</h2><label>In scope<textarea value={draft.fields.inScope} maxLength={32768} rows={4} onChange={(event) => setField("inScope", event.target.value)} /></label><label>Out of scope<textarea value={draft.fields.outOfScope} maxLength={32768} rows={4} onChange={(event) => setField("outOfScope", event.target.value)} /></label></section>

      <section className="library-form-section" aria-labelledby="library-form-guardrails"><h2 id="library-form-guardrails">Guardrails</h2><label>Hard constraints<textarea value={draft.fields.hardConstraints} maxLength={32768} rows={4} onChange={(event) => setField("hardConstraints", event.target.value)} /></label><label>Acceptance criteria <span aria-hidden="true">*</span><textarea value={draft.fields.acceptanceCriteria} maxLength={32768} rows={4} required onChange={(event) => setField("acceptanceCriteria", event.target.value)} /></label><label>Verification <span aria-hidden="true">*</span><textarea value={draft.fields.verification} maxLength={32768} rows={4} required onChange={(event) => setField("verification", event.target.value)} /></label></section>

      <section className="library-form-section" aria-labelledby="library-form-response"><h2 id="library-form-response">Response</h2><label>Output format<textarea value={draft.fields.outputFormat} maxLength={32768} rows={4} onChange={(event) => setField("outputFormat", event.target.value)} /></label></section>

      <section className="library-form-section" aria-labelledby="library-form-guidance"><h2 id="library-form-guidance">Recommended guidance</h2><div className="library-guidance-grid">{PROMPT_GUIDANCE_PACKS.map((pack) => <GuidanceChoice key={pack.id} id={pack.id} checked={draft.recommendedGuidancePackIds.includes(pack.id)} onChange={() => toggleGuidance(pack.id)} onOpenDocument={onOpenDocument} />)}</div></section>

      {route.mode === "edit" && <section className="library-form-section library-versions" aria-labelledby="library-form-versions"><div className="library-section-title"><h2 id="library-form-versions">Versions</h2><span className="library-count">{detail?.versions.length ?? versionRows.length}</span></div>{versionRows.length === 0 ? <div className="library-pane-empty">No version history</div> : <ol>{versionRows.map((version) => <li key={version.revision}><strong>Version {version.revision}</strong><time dateTime={version.updatedAt}>{version.updatedAt === "Current" ? "Current" : friendlyDate(version.updatedAt)}</time>{version.label && <span>{version.label}</span>}</li>)}</ol>}</section>}
    </div>
    <footer className="library-editor-footer"><span className="sr-only" role="status" aria-live="polite">{revisionChanged ? "A newer template version must be reviewed" : !withinTemplateLimit ? `Template content exceeds the ${PROMPT_TEXT_LIMIT_CHARS.toLocaleString()}-character limit` : readyToSave ? "Ready to save" : "Complete required fields"}</span><span className="library-action-anchor"><button ref={saveRef} type="button" className="library-primary-button" disabled={!readyToSave || saveBusy} aria-expanded={saveOpen} aria-controls={saveId} title={revisionChanged ? "Review the newer template version before saving." : !withinTemplateLimit ? `Reduce template content to ${PROMPT_TEXT_LIMIT_CHARS.toLocaleString()} characters or fewer.` : !readyToSave ? "Complete the required fields before saving." : undefined} onClick={() => setSaveOpen((open) => !open)}>{saveBusy ? "Saving…" : "Save"}</button>{saveOpen && <DismissibleLayer id={saveId} label="Confirm save" triggerRef={saveRef} className="library-confirm-popover save-confirm" onClose={() => setSaveOpen(false)}><strong>{route.mode === "create" ? "Add this template to Prompt Optimizer?" : "Save changes as a new version?"}</strong><p>{route.mode === "create" ? "It will become available in the template selector." : "This updates the current template and records version metadata."}</p><div className="library-popover-actions"><button type="button" onClick={() => { setSaveOpen(false); queueMicrotask(() => saveRef.current?.focus()); }}>Cancel</button><button type="button" className="library-primary-button" disabled={saveBusy} onClick={() => void confirmSave()}>{saveBusy ? "Saving…" : "Confirm save"}</button></div></DismissibleLayer>}</span></footer>
  </section>;
}

export function LibraryWorkspace({
  state,
  detail,
  route: controlledRoute,
  initialRoute = DEFAULT_ROUTE,
  cloneResult,
  onRouteChange,
  onOpen,
  onReload,
  onRequestDetail = () => undefined,
  onCreate,
  onSave = () => undefined,
  onDelete = () => undefined,
  onFeedback = () => undefined,
  onCloneFile = () => undefined,
  onClonePaste = () => undefined,
  onOpenDocument = () => undefined,
}: LibraryWorkspaceProps) {
  const [internalRoute, setInternalRoute] = useState(initialRoute);
  const [localDetail, setLocalDetail] = useState<LibraryTemplateDetail>();
  const [detailError, setDetailError] = useState("");
  const [restoreFocusKey, setRestoreFocusKey] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const route = controlledRoute ?? internalRoute;
  const activeDetail = detail?.item.id === (route.view === "reader" || route.view === "editor" ? route.item?.id : undefined)
    ? detail
    : localDetail?.item.id === (route.view === "reader" || route.view === "editor" ? route.item?.id : undefined) ? localDetail : undefined;

  useEffect(() => { void onOpenRef.current?.(); }, []);

  useEffect(() => {
    if (route.view === "home") {
      const escapedKey = restoreFocusKey.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      const restored = escapedKey ? rootRef.current?.querySelector<HTMLElement>(`[data-library-key="${escapedKey}"]`) : undefined;
      (restored ?? rootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]'))?.focus();
      return;
    }
    rootRef.current?.querySelector<HTMLElement>("[data-library-route-focus]")?.focus();
  }, [restoreFocusKey, route.view, route.view === "home" ? route.tab : route.item?.id, route.view === "editor" ? route.mode : undefined]);

  function navigate(next: LibraryRoute): void {
    if (!controlledRoute) setInternalRoute(next);
    onRouteChange?.(next);
  }

  async function openItem(item: LibraryItemSummary): Promise<void> {
    if (item.kind !== "template") return;
    const from = route.view === "home" ? { tab: route.tab, kind: route.kind } : route.from;
    setRestoreFocusKey(itemKey(item));
    setLocalDetail(undefined);
    setDetailError("");
    navigate({ view: "reader", item, from });
    try {
      const requested = await onRequestDetail({ templateId: item.id });
      if (requested) setLocalDetail(requested);
    } catch (caught) {
      setDetailError(caught instanceof Error ? caught.message : "The template could not be loaded.");
    }
  }

  function backToHome(from: { tab: LibraryHomeTab; kind: LibraryKind }): void {
    navigate({ view: "home", tab: from.tab, kind: from.kind });
  }

  return <div ref={rootRef} className="library-workspace">
    {route.view === "home" && <LibraryHome route={route} state={state} onRoute={navigate} onOpenItem={(item) => void openItem(item)} onCreate={(kind) => { onCreate?.(kind); navigate({ view: "editor", mode: "create", from: { tab: route.tab, kind: route.kind } }); }} onReload={onReload} onOpenDocument={onOpenDocument} />}
    {route.view === "reader" && <LibraryReader route={route} detail={activeDetail} loadError={detailError || (state.status === "error" ? state.error : undefined)} onBack={() => backToHome(route.from)} onEdit={() => navigate({ view: "editor", mode: "edit", item: route.item, from: route.from })} onDelete={onDelete} onFeedback={onFeedback} />}
    {route.view === "editor" && <TemplateEditor key={`${route.mode}:${route.item?.id ?? "new"}`} route={route} detail={activeDetail} cloneResult={cloneResult} onBack={() => route.mode === "edit" && route.item ? navigate({ view: "reader", item: route.item, from: route.from }) : backToHome(route.from)} onSave={onSave} onSaved={(saved) => {
      if (saved) {
        setLocalDetail(saved);
        navigate({ view: "reader", item: saved.item, from: route.from });
      } else if (route.mode === "edit" && route.item) navigate({ view: "reader", item: route.item, from: route.from });
      else backToHome(route.from);
    }} onCloneFile={onCloneFile} onClonePaste={onClonePaste} onOpenDocument={onOpenDocument} />}
  </div>;
}
