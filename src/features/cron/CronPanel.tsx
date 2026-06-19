import { DataPanel } from "@/features/_shared/DataPanel";
import { apiCron } from "@/api/tools";
import { queryKeys } from "@/api/query";

export function CronPanel() {
  return (
    <DataPanel
      what="cron jobs"
      queryKey={queryKeys.gateway.cron}
      load={apiCron}
      render={(data) => (
        <table className="w-full text-xs">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="py-1 pr-2">Name</th>
              <th className="py-1 pr-2">Schedule</th>
              <th className="py-1">Prompt</th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((j) => (
              <tr key={j.id} className="border-t border-white/10">
                <td className="py-1.5 pr-2 font-mono text-cyan-300">{String(j.name ?? j.id)}</td>
                <td className="py-1.5 pr-2 font-mono text-neutral-400">
                  {String(j["schedule"] ?? "")}
                </td>
                <td className="py-1.5 text-neutral-300">{String(j["prompt"] ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    />
  );
}
