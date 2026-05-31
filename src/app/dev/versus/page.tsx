import { notFound } from "next/navigation";
import { BoardPane } from "@/components/board-pane";

export const dynamic = "force-dynamic";

export default function VersusPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="min-w-0 flex-1 border-r-2 border-neutral-400">
        <BoardPane label="Player A" storageKey="versus-a" />
      </div>
      <div className="min-w-0 flex-1">
        <BoardPane label="Player B" storageKey="versus-b" />
      </div>
    </div>
  );
}
