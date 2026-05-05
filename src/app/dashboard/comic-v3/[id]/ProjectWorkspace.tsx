"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import StepTimeline from "./StepTimeline";
import StepWorkspace from "./StepWorkspace";
import ProjectHeader from "./ProjectHeader";
import type { ProjectSnapshot, StepRow } from "./types";

export default function ProjectWorkspace({
  projectId,
  initialTitle,
}: {
  projectId: string;
  initialTitle: string;
}) {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  useEffect(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/api/comic-v3/projects/${projectId}/stream`);
    esRef.current = es;
    es.addEventListener("update", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as ProjectSnapshot;
        setSnapshot(data);
        setActiveStepKey((cur) => {
          // 自动滚到 currentStep 或 awaiting_user 的那一步
          if (cur) return cur;
          const target =
            data.steps.find((s) => s.status === "awaiting_user")?.stepKey ||
            data.currentStep ||
            data.steps[0]?.stepKey ||
            null;
          return target;
        });
      } catch {}
    });
    es.addEventListener("error", () => {
      // 连接异常时不主动报错；SSE 会自动重连
    });
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [projectId]);

  // 当 snapshot 中的 awaiting_user 步切换时，自动跟随
  useEffect(() => {
    if (!snapshot) return;
    const awaiting = snapshot.steps.find((s) => s.status === "awaiting_user");
    if (awaiting && awaiting.stepKey !== activeStepKey) {
      setActiveStepKey(awaiting.stepKey);
    }
  }, [snapshot, activeStepKey]);

  const activeStep: StepRow | null =
    snapshot?.steps.find((s) => s.stepKey === activeStepKey) ?? null;

  async function callAction(path: string, body?: object) {
    setActionPending(path);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : "{}",
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "操作失败");
      return data;
    } finally {
      setActionPending(null);
    }
  }

  const stepsApiBase = `/api/comic-v3/projects/${projectId}/steps`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        <Link
          href="/dashboard/comic-v3"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> 返回项目列表
        </Link>

        <ProjectHeader title={initialTitle} snapshot={snapshot} />

        <div className="mt-6 grid grid-cols-1 md:grid-cols-[260px,1fr] gap-6">
          <aside className="md:sticky md:top-4 md:self-start">
            <StepTimeline
              steps={snapshot?.steps || []}
              activeKey={activeStepKey}
              onPick={(k) => setActiveStepKey(k)}
            />
          </aside>

          <main>
            <StepWorkspace
              snapshot={snapshot}
              step={activeStep}
              actionPending={actionPending}
              onRun={async () => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/run`, { auto: true });
              }}
              onPick={async (candidateId) => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/pick`, { candidateId });
              }}
              onEdit={async (patch) => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/edit`, { patch });
              }}
              onConfirm={async () => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/confirm`, { auto: true });
              }}
              onSkip={async () => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/skip`, {});
              }}
              onRetry={async () => {
                if (!activeStep) return;
                await callAction(`${stepsApiBase}/${activeStep.stepKey}/retry`, {});
              }}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
