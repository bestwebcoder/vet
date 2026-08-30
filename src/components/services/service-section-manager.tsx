"use client";

import { createElement, useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DraggableAttributes,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { RepeatableField } from "@/components/form/repeatable-field";
import { SubmitButton } from "@/components/form/submit-button";
import {
  DeleteCategoryDialog,
  EditCategoryDialog,
  ToggleCategoryActiveButton,
} from "@/components/services/service-category-manager";
import { DeleteServiceDialog, ToggleServiceActiveButton } from "@/components/services/service-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { reorderCategoriesAction } from "@/features/service-categories/actions";
import type { ServiceCategory } from "@/features/service-categories/queries";
import { reorderServicesAction, updateServicePresentationAction } from "@/features/services/actions";
import type { ServiceSummary } from "@/features/services/queries";
import { idleState, type FormState } from "@/lib/forms";
import { iconByKey } from "@/lib/icons";

/**
 * The public page's service sections, edited on the page they belong to.
 *
 * It mirrors what /services renders — a block per category carrying its
 * heading, blurb and icon, with one block per service nested inside it — so an
 * admin arranging the website works on the same shape they are looking at,
 * and drags it into the order they want it read in.
 *
 * The records are the catalogue's own (service_categories and services), not a
 * website copy of them: a second copy would mean a page quoting last month's
 * price, which is exactly what CLAUDE.md §9.4 forbids. What differs is which
 * half of a record each screen edits. Admin → Services owns the catalogue —
 * price, duration, tax, whether a doctor is needed. This screen owns the
 * words: the heading, the blurb, the tagline, the bullet list and the fee
 * lines as they read on the page. Saving here cannot move a price.
 *
 * Dragging is deliberately confined within a section: a service leaving its
 * category is a catalogue decision — it changes what the booking screen and
 * the invoice picker group it under — not a rearrangement of a page, so it
 * stays on the Category dropdown in Admin → Services.
 */

export type ServiceSection = {
  /** Null for services with no category — the page's "Other services". */
  category: ServiceCategory | null;
  heading: string;
  description: string | null;
  icon: string | null;
  services: ServiceSummary[];
};

/** Same reasoning as the public page's CategoryIcon — see that file. */
function SectionIcon({ icon }: { icon: string | null }) {
  const found = iconByKey(icon);
  if (!found) return null;

  return createElement(found, { "aria-hidden": true, className: "text-muted-foreground size-4 shrink-0" });
}

function DragHandle({
  label,
  attributes,
  listeners,
}: {
  label: string;
  attributes: DraggableAttributes;
  listeners: ReturnType<typeof useSortable>["listeners"];
}) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 cursor-grab touch-none active:cursor-grabbing"
      aria-label={label}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );
}

/** What this service's block says on the page, in one line. */
function blockSummary(service: ServiceSummary): string {
  const fee =
    service.feeTiers.length > 0
      ? service.feeTiers.map((tier) => (tier.qualifier ? `${tier.amount} / ${tier.qualifier}` : tier.amount)).join(" · ")
      : `${service.price} (from the catalogue price)`;

  const points = service.inclusions.length === 1 ? "1 point" : `${service.inclusions.length} points`;
  return `${points} · ${fee}`;
}

function ServiceBlockEditor({ service }: { service: ServiceSummary }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateServicePresentationAction, idleState);
  const fieldErrors = state.status === "error" ? state.fieldErrors : undefined;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: service.id });

  // Collapse on a successful save, so the list reads as the page again.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state.status === "success") setEditing(false);
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-muted/30 rounded-xl border p-3 text-sm${isDragging ? " opacity-40" : ""}`}
    >
      {!editing ? (
        <div className="flex items-start gap-3">
          <DragHandle label={`Drag to reorder ${service.name}`} attributes={attributes} listeners={listeners} />

          <div className="grid min-w-0 flex-1 gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {service.name}
              {!service.isActive ? <Badge variant="outline">Not on the page</Badge> : null}
            </span>
            <span className="text-muted-foreground text-xs italic">{service.tagline ?? "No tagline"}</span>
            <span className="text-muted-foreground text-xs" data-numeric>
              {blockSummary(service)}
            </span>
          </div>

          {/* Wraps rather than squeezing: three controls plus a title do not
              fit one phone-width line, and a clipped Delete is worse than a
              second row. */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit block
            </Button>
            <ToggleServiceActiveButton service={service} />
            <DeleteServiceDialog service={service} />
          </div>
        </div>
      ) : (
        <form action={formAction} className="grid gap-4" noValidate>
          <FormAlert state={state} />
          <input type="hidden" name="serviceId" value={service.id} />

          <Field label="Block title" name="name" defaultValue={service.name} errors={fieldErrors?.name} />

          <Field
            label="Tagline"
            name="tagline"
            defaultValue={service.tagline ?? ""}
            hint="The italic line under the title."
            errors={fieldErrors?.tagline}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="List heading"
              name="inclusionsLabel"
              defaultValue={service.inclusionsLabel ?? ""}
              hint="“What’s included” if left blank."
              errors={fieldErrors?.inclusionsLabel}
            />
            <Field
              label="Fee label"
              name="feeLabel"
              defaultValue={service.feeLabel ?? ""}
              hint="“Fee” if left blank."
              errors={fieldErrors?.feeLabel}
            />
          </div>

          <RepeatableField
            label="What this includes"
            name="inclusion"
            placeholder="Full physical examination"
            hint="One point per line. Up to 12."
            defaultValues={service.inclusions.map((value) => ({ value }))}
            addLabel="Add a point"
          />

          <RepeatableField
            label="Fee shown on the website"
            name="feeAmount"
            placeholder="6,000 – 8,000 BDT"
            secondName="feeQualifier"
            secondPlaceholder="single pet"
            hint="Free text, so a range or “Fee upon enquiry” both work. Leave empty to show the catalogue price. Up to 4 lines."
            max={4}
            defaultValues={service.feeTiers.map((tier) => ({ value: tier.amount, second: tier.qualifier }))}
            addLabel="Add a fee line"
          />

          <Field
            label="Fee note"
            name="feeNote"
            defaultValue={service.feeNote ?? ""}
            hint="For example “Medication and laboratory costs excluded”."
            errors={fieldErrors?.feeNote}
          />

          <p className="text-muted-foreground text-xs">
            Price, duration and booking settings are not on this form — they stay in Services, and saving here leaves
            them untouched.
          </p>

          {/* Full width on a phone, side by side from sm: — SubmitButton is
              w-full by default, and a row of two would push Cancel off the card. */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <SubmitButton pendingLabel="Saving…" className="sm:w-auto">
              Save block
            </SubmitButton>
            <Button type="button" variant="outline" size="touch" className="sm:w-auto" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

/** The id a section sorts under. Uncategorised services have no record. */
function sectionId(section: ServiceSection): string {
  return section.category?.id ?? "other";
}

function SectionBlock({ section, serviceOrder }: { section: ServiceSection; serviceOrder: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionId(section),
  });
  const byId = new Map(section.services.map((service) => [service.id, service]));

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`bg-card grid gap-3 rounded-2xl border p-4${isDragging ? " opacity-40" : ""}`}
    >
      <div className="flex items-start gap-3">
        <DragHandle label={`Drag to reorder ${section.heading}`} attributes={attributes} listeners={listeners} />

        <div className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-center gap-2 font-medium">
            <SectionIcon icon={section.icon} />
            {section.heading}
            {section.category && !section.category.isActive ? <Badge variant="outline">Inactive</Badge> : null}
          </span>
          {section.description ? (
            <span className="text-muted-foreground text-sm">{section.description}</span>
          ) : (
            <span className="text-muted-foreground text-sm italic">No blurb under this heading</span>
          )}
        </div>

        {/* Uncategorised services have no heading record to edit — the page
            writes that heading itself, and the fix is to file them. */}
        {section.category ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <EditCategoryDialog category={section.category} triggerLabel="Edit heading" />
            <ToggleCategoryActiveButton category={section.category} />
            <DeleteCategoryDialog category={section.category} />
          </div>
        ) : null}
      </div>

      <SortableContext items={serviceOrder} strategy={verticalListSortingStrategy}>
        <ul className="grid gap-2">
          {serviceOrder.map((id) => {
            const service = byId.get(id);
            return service ? <ServiceBlockEditor key={id} service={service} /> : null;
          })}
        </ul>
      </SortableContext>
    </div>
  );
}

/**
 * One DndContext for both levels, not one per section.
 *
 * Nesting a DndContext inside another looks like it should work and does not:
 * the inner provider swallows the drag, and the outer one's onDragEnd never
 * fires, so sections could be picked up and never dropped. dnd-kit's own
 * answer to two levels is one context holding several SortableContexts, which
 * is what this is — one list of sections, and one list of services inside each
 * of them. Which list a drag belongs to is read off the id it started on.
 */
export function ServiceSectionManager({ sections }: { sections: ServiceSection[] }) {
  const router = useRouter();
  const [sectionOrder, setSectionOrder] = useState(() => sections.map(sectionId));
  const [serviceOrders, setServiceOrders] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(sections.map((section) => [sectionId(section), section.services.map((s) => s.id)])),
  );
  const [saveState, setSaveState] = useState<FormState>(idleState);

  const byId = new Map(sections.map((section) => [sectionId(section), section]));

  // A save brings new records down from the server; adopt their order rather
  // than holding the one this component mounted with.
  const [lastSections, setLastSections] = useState(sections);
  if (sections !== lastSections) {
    setLastSections(sections);
    setSectionOrder(sections.map(sectionId));
    setServiceOrders(
      Object.fromEntries(sections.map((section) => [sectionId(section), section.services.map((s) => s.id)])),
    );
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /** The section a dragged id belongs to, whether it is a section or a service. */
  function ownerOf(id: string): string | null {
    if (sectionOrder.includes(id)) return id;
    return sectionOrder.find((key) => serviceOrders[key]?.includes(id)) ?? null;
  }

  /**
   * Collisions are judged only against the level being dragged.
   *
   * Without this a section never lands anywhere: it is the box its services
   * sit in, so the nearest thing to it while dragging is always one of its own
   * rows, and the drop resolves back onto itself. Narrowing the candidates to
   * the other sections — or, for a service, to its siblings — leaves each
   * drag exactly the targets it could sensibly have, and gives the sibling
   * rule teeth rather than relying on a check after the fact.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const activeId = String(args.active.id);
    const owner = ownerOf(activeId);
    const candidates = sectionOrder.includes(activeId) ? sectionOrder : (serviceOrders[owner ?? ""] ?? []);

    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (container) => container.id !== activeId && candidates.includes(String(container.id)),
      ),
    });
  };

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    if (sectionOrder.includes(activeId)) {
      // Dropping a section on a service inside another section means that
      // section — the pointer is over it either way.
      const target = ownerOf(overId);
      if (!target || target === activeId) return;

      const nextOrder = arrayMove(sectionOrder, sectionOrder.indexOf(activeId), sectionOrder.indexOf(target));
      setSectionOrder(nextOrder);

      const formData = new FormData();
      // "other" is not a category and has no row to number — the page always
      // sorts uncategorised services last, wherever it is dropped.
      formData.set("order", JSON.stringify(nextOrder.filter((id) => id !== "other")));
      const result = await reorderCategoriesAction(idleState, formData);
      setSaveState(result);
      if (result.status === "success") router.refresh();
      return;
    }

    // A service only moves within its own section: leaving a category changes
    // what booking and invoicing group it under, which is a catalogue
    // decision and stays on the Category dropdown in Admin → Services.
    const owner = ownerOf(activeId);
    if (!owner || ownerOf(overId) !== owner) return;

    const order = serviceOrders[owner] ?? [];
    const oldIndex = order.indexOf(activeId);
    const newIndex = order.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const nextOrder = arrayMove(order, oldIndex, newIndex);
    setServiceOrders({ ...serviceOrders, [owner]: nextOrder });

    const formData = new FormData();
    formData.set("order", JSON.stringify(nextOrder));
    const result = await reorderServicesAction(idleState, formData);
    setSaveState(result);
    if (result.status === "success") router.refresh();
  }

  if (sections.length === 0) {
    return <p className="text-muted-foreground text-sm">No services are listed on this page yet.</p>;
  }

  return (
    <div className="grid gap-4">
      <FormAlert state={saveState} />

      <DndContext
        id="service-sections"
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
          <div className="grid gap-4">
            {sectionOrder.map((id) => {
              const section = byId.get(id);
              return section ? (
                <SectionBlock key={id} section={section} serviceOrder={serviceOrders[id] ?? []} />
              ) : null;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
