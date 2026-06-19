import { useLingui } from "@lingui/react/macro";
import { Code2 } from "lucide-react";
import type { ConfigSectionInfo } from "@/api/config";
import { EmptyState } from "@/ui/feedback";
import type { FormTarget } from "../types";
import { ConfigFieldForm } from "../fields/ConfigFieldForm";
import { PickerSection } from "../picker/PickerSection";

export function SectionExplorer({
  section,
  target,
  reloadKey,
  onTarget,
  onSaved,
}: {
  section: ConfigSectionInfo | null;
  target: FormTarget | null;
  reloadKey: number;
  onTarget: (target: FormTarget | null) => void;
  onSaved: () => void;
}) {
  const { t } = useLingui();
  if (!section) {
    return (
      <EmptyState
        icon={<Code2 size={28} />}
        title={t`Select a config section`}
        body={t`Choose a section to inspect its picker, aliases, and editable fields.`}
      />
    );
  }

  if (target) {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${target.prefix}`}
        target={target}
        onBack={() => onTarget(null)}
        onSaved={onSaved}
      />
    );
  }

  if (!section.has_picker || section.shape === "direct_form") {
    return (
      <ConfigFieldForm
        key={`${reloadKey}-${section.key}`}
        target={{
          prefix: section.key,
          title: section.label,
          subtitle: section.help,
        }}
        onSaved={onSaved}
      />
    );
  }

  return <PickerSection section={section} onTarget={onTarget} onSaved={onSaved} />;
}
