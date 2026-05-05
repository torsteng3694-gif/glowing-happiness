"use client";

import { useEffect, useState } from "react";
import { Button, Input, Label, Spinner, Textarea } from "@/components/ui";
import { Pencil, Plus, Trash2, UserRound, X } from "lucide-react";

export type Persona = {
  id: string;
  name: string;
  description?: string | null;
  avatar?: string | null;
  systemPrompt: string;
  /** "official" 或 "mine" — 仅前端区分用 */
  source: "official" | "mine";
};

type ApiList = {
  official: Array<{ id: string; name: string; description: string; avatar: string; systemPrompt: string }>;
  mine: Array<{ id: string; name: string; description: string | null; avatar: string | null; systemPrompt: string }>;
};

const AVATAR_PRESETS = ["🤖", "✍️", "📝", "💼", "📊", "💻", "🎓", "🌐", "🦉", "🎨", "🧠", "📚"];

export default function PersonaModal({
  open,
  selectedId,
  onClose,
  onSelect,
}: {
  open: boolean;
  selectedId: string | null;
  onClose: () => void;
  onSelect: (persona: Persona | null) => void;
}) {
  const [tab, setTab] = useState<"mine" | "create">("mine");
  const [loading, setLoading] = useState(false);
  const [official, setOfficial] = useState<Persona[]>([]);
  const [mine, setMine] = useState<Persona[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    void load();
    setTab("mine");
    setEditingId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/chat-personas", { cache: "no-store" });
      if (!r.ok) throw new Error("加载失败");
      const data: ApiList = await r.json();
      setOfficial(data.official.map((p) => ({ ...p, source: "official" as const })));
      setMine(
        data.mine.map((p) => ({
          ...p,
          avatar: p.avatar || "🤖",
          source: "mine" as const,
        })),
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("确定删除这个角色？")) return;
    const r = await fetch(`/api/chat-personas/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      alert(data.error || "删除失败");
      return;
    }
    if (selectedId === id) onSelect(null);
    setMine((arr) => arr.filter((p) => p.id !== id));
  }

  function handleEdit(id: string) {
    setEditingId(id);
    setTab("create");
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <UserRound className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900">角色管理</h2>
            <p className="text-xs text-slate-500 mt-0.5">管理 AI 对话角色，自定义回复风格</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className="px-6 pt-3 border-b border-slate-100 flex items-center gap-1">
          <TabButton active={tab === "mine"} onClick={() => { setTab("mine"); setEditingId(null); }}>
            <UserRound className="w-4 h-4" /> 我的角色
          </TabButton>
          <TabButton active={tab === "create"} onClick={() => { setTab("create"); setEditingId(null); }}>
            <Plus className="w-4 h-4" /> {editingId ? "编辑角色" : "创建角色"}
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === "mine" ? (
            <MineList
              loading={loading}
              official={official}
              mine={mine}
              selectedId={selectedId}
              onPick={(p) => { onSelect(p); onClose(); }}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCreate={() => { setEditingId(null); setTab("create"); }}
            />
          ) : (
            <CreateForm
              key={editingId ?? "new"}
              editing={editingId ? mine.find((p) => p.id === editingId) ?? null : null}
              onSaved={(p) => {
                if (editingId) {
                  setMine((arr) => arr.map((x) => (x.id === p.id ? p : x)));
                } else {
                  setMine((arr) => [p, ...arr]);
                }
                setEditingId(null);
                setTab("mine");
              }}
              onCancel={() => { setEditingId(null); setTab("mine"); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition " +
        (active
          ? "text-sky-600 border-sky-500 font-medium"
          : "text-slate-500 border-transparent hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

function MineList({
  loading,
  official,
  mine,
  selectedId,
  onPick,
  onEdit,
  onDelete,
  onCreate,
}: {
  loading: boolean;
  official: Persona[];
  mine: Persona[];
  selectedId: string | null;
  onPick: (p: Persona | null) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
        <Spinner /> 加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50/40 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-sky-700 flex items-center gap-1.5">
              <UserRound className="w-4 h-4" /> 已有角色
            </div>
            <p className="text-xs text-slate-500 mt-1">选择一个角色，AI 将以该角色的设定进行对话</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => onPick(null)} disabled={!selectedId}>
            清除当前角色
          </Button>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="space-y-2">
          {mine.map((p) => (
            <PersonaCard
              key={p.id}
              persona={p}
              selected={selectedId === p.id}
              onPick={() => onPick(p)}
              onEdit={() => onEdit(p.id)}
              onDelete={() => onDelete(p.id)}
            />
          ))}
        </div>
      )}

      <div className="space-y-2">
        {official.map((p) => (
          <PersonaCard
            key={p.id}
            persona={p}
            selected={selectedId === p.id}
            onPick={() => onPick(p)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-sky-300 hover:text-sky-600 hover:bg-sky-50/50 transition flex items-center justify-center gap-1.5"
      >
        <Plus className="w-4 h-4" /> 创建新角色
      </button>
    </div>
  );
}

function PersonaCard({
  persona,
  selected,
  onPick,
  onEdit,
  onDelete,
}: {
  persona: Persona;
  selected: boolean;
  onPick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      className={
        "group relative rounded-xl border px-4 py-3 cursor-pointer transition " +
        (selected
          ? "border-sky-400 bg-sky-50/70 ring-2 ring-sky-200/60"
          : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/30")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-lg " +
            (persona.source === "mine"
              ? "bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-700"
              : "bg-gradient-to-br from-slate-100 to-slate-200 text-slate-700")
          }
        >
          {persona.avatar || "🤖"}
        </div>
        <div className="flex-1 min-w-0 pr-16">
          <div className="text-sm font-semibold text-slate-900 truncate">{persona.name}</div>
          {persona.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{persona.description}</div>
          )}
        </div>
      </div>
      <span
        className={
          "absolute top-2.5 right-3 text-[10px] px-1.5 py-0.5 rounded " +
          (persona.source === "mine"
            ? "bg-sky-100 text-sky-700"
            : "bg-slate-100 text-slate-600")
        }
      >
        {persona.source === "mine" ? "自建" : "官方"}
      </span>
      {persona.source === "mine" && (onEdit || onDelete) && (
        <div className="absolute bottom-2 right-3 flex items-center gap-1">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1.5 rounded-md text-sky-600 hover:bg-sky-100"
              title="编辑"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1.5 rounded-md text-rose-500 hover:bg-rose-50"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CreateForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: Persona | null;
  onSaved: (p: Persona) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [avatar, setAvatar] = useState(editing?.avatar ?? "🤖");
  const [systemPrompt, setSystemPrompt] = useState(editing?.systemPrompt ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!name.trim()) return setErr("请填写角色名称");
    if (!systemPrompt.trim()) return setErr("请填写角色设定");
    setSaving(true);
    try {
      const url = editing ? `/api/chat-personas/${editing.id}` : "/api/chat-personas";
      const method = editing ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description?.trim() || "",
          avatar: avatar?.trim() || "🤖",
          systemPrompt: systemPrompt.trim(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.error || "保存失败");
        return;
      }
      onSaved({ ...data.persona, source: "mine" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-3 sm:gap-4 items-start">
        <div>
          <Label>头像</Label>
          <div className="mt-1 w-16 h-16 rounded-full bg-gradient-to-br from-sky-100 to-indigo-100 text-2xl flex items-center justify-center">
            {avatar || "🤖"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1 max-w-[280px]">
            {AVATAR_PRESETS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAvatar(a)}
                className={
                  "w-7 h-7 rounded-md flex items-center justify-center text-base hover:bg-slate-100 " +
                  (avatar === a ? "bg-sky-100 ring-1 ring-sky-300" : "")
                }
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3 min-w-0">
          <div>
            <Label>角色名称</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品经理小助手"
              maxLength={40}
              className="mt-1"
            />
          </div>
          <div>
            <Label>简短描述（可选）</Label>
            <Input
              value={description ?? ""}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话描述角色擅长什么"
              maxLength={200}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      <div>
        <Label>角色设定（System Prompt）</Label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="详细描述这个角色的身份、说话风格、回答规范、要避免的事项等。AI 会严格按照此设定回答。"
          rows={8}
          maxLength={4000}
          className="mt-1 font-mono text-[13px] leading-6"
        />
        <div className="mt-1 text-right text-xs text-slate-400">
          {systemPrompt.length} / 4000
        </div>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        <Button variant="glow" onClick={submit} loading={saving}>
          {editing ? "保存修改" : "创建角色"}
        </Button>
      </div>
    </div>
  );
}
