"use client";

import { useActionState, useState } from "react";

import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SelectField } from "@/components/form/select-field";
import { SubmitButton } from "@/components/form/submit-button";
import { TextAreaField } from "@/components/form/textarea-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Template } from "@/features/notifications/templates";
import { setTemplateActiveAction, upsertTemplateAction } from "@/features/notifications/templates";
import { idleState } from "@/lib/forms";
import { NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS } from "@/lib/notifications/catalog";

const TYPE_OPTIONS = NOTIFICATION_TYPES.map((type) => ({ value: type, label: NOTIFICATION_TYPE_LABELS[type] }));
const CHANNEL_OPTIONS = NOTIFICATION_CHANNELS.map((channel) => ({
  value: channel,
  label: NOTIFICATION_CHANNEL_LABELS[channel],
}));

function TemplateEditorForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState(upsertTemplateAction, idleState);
  const [channel, setChannel] = useState<string>("email");

  return (
    <form action={formAction} className="grid gap-4">
      <FormAlert state={state} />
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Notification" name="type" options={TYPE_OPTIONS} defaultValue={TYPE_OPTIONS[0].value} />
        <SelectField
          label="Channel"
          name="channel"
          options={CHANNEL_OPTIONS}
          defaultValue="email"
          onValueChange={setChannel}
        />
      </div>
      {channel === "email" ? (
        <Field label="Subject" name="subjectTemplate" placeholder="Reminder: {{title}}" />
      ) : null}
      <TextAreaField
        label="Body"
        name="bodyTemplate"
        rows={4}
        hint="Use {{title}} and {{body}} — they are replaced with the notification's own content."
      />
      <div>
        <SubmitButton pendingLabel="Saving…">Save template</SubmitButton>
      </div>
    </form>
  );
}

function TemplateActiveToggle({ template }: { template: Template }) {
  const [, formAction] = useActionState(setTemplateActiveAction, idleState);

  return (
    <form action={formAction}>
      <input type="hidden" name="templateId" value={template.id} />
      <input type="hidden" name="isActive" value={String(template.isActive)} />
      <Button type="submit" variant="outline" size="sm">
        {template.isActive ? "Deactivate" : "Activate"}
      </Button>
    </form>
  );
}

/** §9.6 — templates are admin-editable content; a channel with no active template falls back to the notification's own title/body. */
export function TemplateEditor({ organizationId, templates }: { organizationId: string; templates: Template[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Templates</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6">
        <TemplateEditorForm organizationId={organizationId} />

        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No templates yet — every notification sends using its own title and message until one is saved here.
          </p>
        ) : (
          <ul className="grid gap-2">
            {templates.map((template) => (
              <li key={template.id} className="grid gap-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    {NOTIFICATION_TYPE_LABELS[template.type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? template.type}
                    <Badge variant="secondary">{NOTIFICATION_CHANNEL_LABELS[template.channel as keyof typeof NOTIFICATION_CHANNEL_LABELS] ?? template.channel}</Badge>
                    {!template.isActive ? <Badge variant="outline">Inactive</Badge> : null}
                  </span>
                  <TemplateActiveToggle template={template} />
                </div>
                {template.subjectTemplate ? (
                  <p className="text-muted-foreground">Subject: {template.subjectTemplate}</p>
                ) : null}
                <p className="text-muted-foreground whitespace-pre-wrap">{template.bodyTemplate}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
