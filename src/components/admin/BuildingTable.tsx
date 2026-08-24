"use client";

import { useMutation, useQuery } from "convex/react";
import { Loader2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { api } from "../../../convex/_generated/api";
import { BUILDING_STATUS } from "../../../lib/constants";
import { BuildingCreateDialog } from "@/components/admin/BuildingCreateDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type BuildingTableProps = {
  societyId: Id<"societies">;
};

function statusBadgeClassName(status: Doc<"buildings">["status"]): string {
  if (status === BUILDING_STATUS.ACTIVE) {
    return "border-green-200 bg-green-50 text-green-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function floorLabelsPreview(labels: string[]): string {
  if (labels.length <= 4) {
    return labels.join(", ");
  }

  const visibleLabels = labels.slice(0, 4).join(", ");
  return `${visibleLabels}, ... +${labels.length - 4} more`;
}

export function BuildingTable({ societyId }: BuildingTableProps) {
  const buildings = useQuery(api.buildings.listBySociety, { society_id: societyId });
  const updateBuilding = useMutation(api.buildings.update);
  const softDeleteBuilding = useMutation(api.buildings.softDelete);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingBuilding, setEditingBuilding] = useState<Doc<"buildings"> | undefined>(undefined);
  const [buildingToDelete, setBuildingToDelete] = useState<Doc<"buildings"> | null>(null);
  const [activeBuildingId, setActiveBuildingId] = useState<Id<"buildings"> | null>(null);

  const sortedBuildings = useMemo(() => {
    if (!buildings) {
      return [];
    }

    return [...buildings].sort((a, b) => a.name.localeCompare(b.name));
  }, [buildings]);

  async function handleToggleStatus(building: Doc<"buildings">) {
    const nextStatus =
      building.status === BUILDING_STATUS.ACTIVE
        ? BUILDING_STATUS.INACTIVE
        : BUILDING_STATUS.ACTIVE;

    try {
      setActiveBuildingId(building._id);
      await updateBuilding({
        id: building._id,
        status: nextStatus,
      });
      toast.success(`Building marked ${nextStatus.toLowerCase()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update building status";
      toast.error(message);
    } finally {
      setActiveBuildingId(null);
    }
  }

  async function handleDelete() {
    if (!buildingToDelete) {
      return;
    }

    try {
      setActiveBuildingId(buildingToDelete._id);
      await softDeleteBuilding({ id: buildingToDelete._id });
      toast.success("Building deleted");
      setBuildingToDelete(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete building";
      toast.error(message);
    } finally {
      setActiveBuildingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Manage buildings for this society.</p>
        <Button
          type="button"
          className="h-10 bg-slate-900 text-white hover:bg-slate-800"
          onClick={() => setIsCreateOpen(true)}
        >
          <Plus className="size-4" />
          Add Building
        </Button>
      </div>

      {buildings === undefined ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="space-y-3 pt-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`building-row-${index}`} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : sortedBuildings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No buildings yet.</p>
          <p className="mt-1 text-sm text-slate-500">Add your first building to this society.</p>
        </div>
      ) : (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">Buildings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2.5 pr-3 font-medium">Name</th>
                    <th className="px-3 py-2.5 text-right font-medium">Floors</th>
                    <th className="px-3 py-2.5 text-right font-medium">Flats</th>
                    <th className="px-3 py-2.5 font-medium">Floor Labels</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="py-2.5 pl-3 pr-0 text-right font-medium">Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {sortedBuildings.map((building) => {
                    const isBusy = activeBuildingId === building._id;

                    return (
                      <tr key={building._id} className="border-b border-slate-100 text-slate-800">
                        <td className="py-3 pr-3 font-medium text-slate-900">{building.name}</td>
                        <td className="px-3 py-3 text-right">{building.total_floors}</td>
                        <td className="px-3 py-3 text-right">{building.total_flats ?? "-"}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {floorLabelsPreview(building.floor_labels)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={statusBadgeClassName(building.status)}>
                            {building.status}
                          </Badge>
                        </td>
                        <td className="py-3 pl-3 pr-0">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => {
                                setEditingBuilding(building);
                              }}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => void handleToggleStatus(building)}
                            >
                              {isBusy ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Power className="size-4" />
                              )}
                              {building.status === BUILDING_STATUS.ACTIVE
                                ? "Set Inactive"
                                : "Set Active"}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              disabled={isBusy}
                              onClick={() => setBuildingToDelete(building)}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <BuildingCreateDialog
        open={isCreateOpen}
        openChangeAction={setIsCreateOpen}
        societyId={societyId}
      />
      <BuildingCreateDialog
        open={editingBuilding !== undefined}
        openChangeAction={(open) => {
          if (!open) {
            setEditingBuilding(undefined);
          }
        }}
        societyId={societyId}
        building={editingBuilding}
      />

      <Dialog
        open={buildingToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBuildingToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete building?</DialogTitle>
            <DialogDescription>Are you sure? This will soft-delete the building.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBuildingToDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={buildingToDelete === null}
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
