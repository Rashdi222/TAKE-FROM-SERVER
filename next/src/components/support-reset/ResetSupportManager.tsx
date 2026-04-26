"use client";

import { useMemo, useState } from "react";
import { ApiError, ResetSupportContact } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Props = {
  title: string;
  description: string;
  contacts: ResetSupportContact[];
  isLoading?: boolean;
  createContact: (body: Record<string, unknown>) => Promise<unknown>;
  updateContact: (id: string, body: Record<string, unknown>) => Promise<unknown>;
  deleteContact: (id: string) => Promise<unknown>;
};

const emptyForm = {
  channel: "whatsapp",
  label: "",
  value: "",
  is_active: true,
};

export function ResetSupportManager({
  title,
  description,
  contacts,
  isLoading,
  createContact,
  updateContact,
  deleteContact,
}: Props) {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const submitLabel = useMemo(() => (editingId ? "Update contact" : "Add contact"), [editingId]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      if (editingId) {
        await updateContact(editingId, form);
        setSuccess("Support contact updated.");
      } else {
        await createContact(form);
        setSuccess("Support contact added.");
      }

      resetForm();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  const handleEdit = (contact: ResetSupportContact) => {
    setEditingId(String(contact.id));
    setForm({
      channel: String(contact.channel ?? "whatsapp"),
      label: String(contact.label ?? ""),
      value: String(contact.value ?? ""),
      is_active: Boolean(contact.is_active),
    });
    setSuccess("");
    setError("");
  };

  const handleToggleActive = async (contact: ResetSupportContact) => {
    setError("");
    setSuccess("");

    try {
      await updateContact(String(contact.id), { is_active: !contact.is_active });
      setSuccess(contact.is_active ? "Support contact disabled." : "Support contact enabled.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  const handleDelete = async (contact: ResetSupportContact) => {
    setError("");
    setSuccess("");

    try {
      await deleteContact(String(contact.id));
      if (editingId === String(contact.id)) {
        resetForm();
      }
      setSuccess("Support contact deleted.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Request failed");
    }
  };

  return (
    <div className="space-y-6">
      <Card variant="surface-2" className="p-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--c-text-faint)]">Reset Support</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--c-text)]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--c-text-muted)]">{description}</p>
      </Card>

      <Card variant="surface-2" className="p-6">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">{submitLabel}</h2>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">
          These contacts are shown when a user uses the forgot-password phone lookup flow.
        </p>

        {error ? <Alert variant="error" className="mt-4">{error}</Alert> : null}
        {success ? <Alert variant="success" className="mt-4">{success}</Alert> : null}

        <form onSubmit={handleSubmit} className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--c-text)]">Channel</label>
            <select
              value={form.channel}
              onChange={(e) => setForm((prev) => ({ ...prev, channel: e.target.value }))}
              className="rounded-[var(--r-sm)] border border-[var(--c-border)] bg-[var(--c-surface-1)] px-4 py-2 text-[var(--c-text)]"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="phone">Phone</option>
            </select>
          </div>

          <Input
            label="Label"
            value={form.label}
            onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
            placeholder="Support team"
          />

          <Input
            label="Contact value"
            value={form.value}
            onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
            required
            placeholder="+923001234567"
          />

          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-[var(--c-text)]">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              Active
            </label>
          </div>

          <div className="md:col-span-2 flex gap-3">
            <Button type="submit" variant="primary">
              {submitLabel}
            </Button>
            {editingId ? (
              <Button type="button" variant="secondary" onClick={resetForm}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card variant="surface-2" className="p-6">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">Configured contacts</h2>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">
          Active contacts are eligible to appear in forgot-password support lookup responses.
        </p>

        {isLoading ? (
          <p className="mt-4 text-sm text-[var(--c-text-muted)]">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <Alert variant="info" className="mt-4">No reset-support contacts configured yet.</Alert>
        ) : (
          <div className="mt-5 space-y-3">
            {contacts.map((contact) => (
              <div
                key={String(contact.id)}
                className="rounded-[var(--r-md)] border border-[var(--c-border)] bg-[rgba(255,255,255,0.02)] p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--c-text)]">
                      {contact.label || (contact.channel === "whatsapp" ? "WhatsApp Support" : "Phone Support")}
                    </p>
                    <p className="mt-1 text-sm text-[var(--c-text-muted)]">{contact.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--c-text-faint)]">
                      {contact.channel} · {contact.is_active ? "active" : "inactive"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" onClick={() => handleEdit(contact)}>
                      Edit
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleToggleActive(contact)}>
                      {contact.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => handleDelete(contact)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
