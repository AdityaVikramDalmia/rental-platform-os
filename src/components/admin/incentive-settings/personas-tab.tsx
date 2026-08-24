"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "convex/react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { INCENTIVE_PERSONA, type IncentivePersona } from "../../../../lib/constants";
import { formatDate, formatDateTime } from "../../../../lib/dates";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type IncentiveActorProfile = Doc<"incentive_actor_profiles">;

type UserOption = {
  id: Id<"users">;
  label: string;
  subLabel: string;
};

type PersonasTabProps = {
  canConfigure: boolean;
  canResolveUserNames: boolean;
  canLoadGuardUsers: boolean;
  canLoadAdminUsers: boolean;
};

const personaValidator = z.union([
  z.literal(INCENTIVE_PERSONA.GUARD),
  z.literal(INCENTIVE_PERSONA.OPS),
  z.literal(INCENTIVE_PERSONA.SALES),
  z.literal(INCENTIVE_PERSONA.RM),
  z.literal(INCENTIVE_PERSONA.LIAISON),
  z.literal(INCENTIVE_PERSONA.ALL),
]);

const assignPersonaSchema = z
  .object({
    user_id: z.string().min(1, "Select a user"),
    persona: personaValidator,
    commission_base_bps: z.string().optional(),
    commission_min_bps: z.string().optional(),
    commission_max_bps: z.string().optional(),
    effective_from: z.string().min(1, "Effective from date is required"),
    effective_to: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const base = parseOptionalBps(values.commission_base_bps, "commission_base_bps", ctx);
    const min = parseOptionalBps(values.commission_min_bps, "commission_min_bps", ctx);
    const max = parseOptionalBps(values.commission_max_bps, "commission_max_bps", ctx);

    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_max_bps"],
        message: "commission_max_bps must be greater than or equal to commission_min_bps",
      });
    }

    if (base !== undefined && min !== undefined && base < min) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_base_bps"],
        message: "commission_base_bps cannot be less than commission_min_bps",
      });
    }

    if (base !== undefined && max !== undefined && base > max) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_base_bps"],
        message: "commission_base_bps cannot exceed commission_max_bps",
      });
    }

    if (values.effective_to && values.effective_to < values.effective_from) {
      ctx.addIssue({
        code: "custom",
        path: ["effective_to"],
        message: "Effective to date must be on or after effective from date",
      });
    }
  });

const editPersonaSchema = z
  .object({
    commission_base_bps: z.string().optional(),
    commission_min_bps: z.string().optional(),
    commission_max_bps: z.string().optional(),
    effective_from: z.string().min(1, "Effective from date is required"),
    effective_to: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const base = parseOptionalBps(values.commission_base_bps, "commission_base_bps", ctx);
    const min = parseOptionalBps(values.commission_min_bps, "commission_min_bps", ctx);
    const max = parseOptionalBps(values.commission_max_bps, "commission_max_bps", ctx);

    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_max_bps"],
        message: "commission_max_bps must be greater than or equal to commission_min_bps",
      });
    }

    if (base !== undefined && min !== undefined && base < min) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_base_bps"],
        message: "commission_base_bps cannot be less than commission_min_bps",
      });
    }

    if (base !== undefined && max !== undefined && base > max) {
      ctx.addIssue({
        code: "custom",
        path: ["commission_base_bps"],
        message: "commission_base_bps cannot exceed commission_max_bps",
      });
    }

    if (values.effective_to && values.effective_to < values.effective_from) {
      ctx.addIssue({
        code: "custom",
        path: ["effective_to"],
        message: "Effective to date must be on or after effective from date",
      });
    }
  });

type AssignPersonaFormValues = z.infer<typeof assignPersonaSchema>;
type EditPersonaFormValues = z.infer<typeof editPersonaSchema>;

function formatBpsPercent(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  const percent = value / 100;
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(percent)}%`;
}

function parseOptionalBps(
  rawValue: string | undefined,
  fieldName: string,
  ctx: z.RefinementCtx,
): number | undefined {
  const value = rawValue?.trim();
  if (!value) {
    return undefined;
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    ctx.addIssue({
      code: "custom",
      path: [fieldName],
      message: "Must be a non-negative integer",
    });
    return undefined;
  }

  return numericValue;
}

function dateInputToStartOfDayMs(value: string): number {
  return new Date(`${value}T00:00:00`).getTime();
}

function dateInputToEndOfDayMs(value: string): number {
  return new Date(`${value}T23:59:59.999`).getTime();
}

function toDateInputValue(timestamp: number | undefined): string {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayDateInputValue(): string {
  return toDateInputValue(Date.now());
}

function UserDisplayCell({
  userId,
  canResolveUserNames,
  userOption,
}: {
  userId: Id<"users">;
  canResolveUserNames: boolean;
  userOption: UserOption | undefined;
}) {
  const user = useQuery(api.users.getById, canResolveUserNames ? { id: userId } : "skip");

  if (userOption) {
    return (
      <div className="space-y-0.5">
        <p className="font-medium text-slate-900">{userOption.label}</p>
        <p className="text-xs text-slate-500">{userOption.subLabel}</p>
      </div>
    );
  }

  if (!canResolveUserNames) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  if (user === undefined) {
    return <span className="text-slate-500">Loading...</span>;
  }

  if (!user) {
    return <span className="font-mono text-xs text-slate-600">{userId}</span>;
  }

  return (
    <div className="space-y-0.5">
      <p className="font-medium text-slate-900">{user.name}</p>
      <p className="text-xs text-slate-500">{user.email ?? user.phone ?? "No contact"}</p>
    </div>
  );
}

function UserCombobox({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: UserOption[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selected ? selected.label : "Select user"}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search user..." />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={`${option.label} ${option.subLabel}`.toLowerCase()}
                  onSelect={() => {
                    onChange(option.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 size-4", value === option.id ? "opacity-100" : "opacity-0")}
                  />
                  <div className="flex flex-col">
                    <span>{option.label}</span>
                    <span className="text-xs text-slate-500">{option.subLabel}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PersonasTab({
  canConfigure,
  canResolveUserNames,
  canLoadGuardUsers,
  canLoadAdminUsers,
}: PersonasTabProps) {
  const [selectedPersona, setSelectedPersona] = useState<IncentivePersona>(INCENTIVE_PERSONA.GUARD);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<IncentiveActorProfile | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<IncentiveActorProfile | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const profilesPage = useQuery(api.incentiveActors.listByPersona, {
    persona: selectedPersona,
    paginationOpts: { numItems: 200, cursor: null },
  });
  const guardUsers = useQuery(api.guards.list, canLoadGuardUsers ? {} : "skip");
  const adminUsers = useQuery(api.admins.listAdmins, canLoadAdminUsers ? {} : "skip");

  const assignPersona = useMutation(api.incentiveActors.assign);
  const updatePersona = useMutation(api.incentiveActors.update);
  const deactivatePersona = useMutation(api.incentiveActors.deactivate);

  const userOptions = useMemo(() => {
    const options = new Map<Id<"users">, UserOption>();

    for (const guard of guardUsers ?? []) {
      options.set(guard.user_id, {
        id: guard.user_id,
        label: guard.name,
        subLabel: guard.phone ? `GUARD - ${guard.phone}` : "GUARD",
      });
    }

    for (const admin of adminUsers ?? []) {
      options.set(admin._id, {
        id: admin._id,
        label: admin.name,
        subLabel: admin.email ? `ADMIN - ${admin.email}` : "ADMIN",
      });
    }

    return Array.from(options.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [adminUsers, guardUsers]);

  const userOptionMap = useMemo(() => {
    return new Map(userOptions.map((option) => [option.id, option]));
  }, [userOptions]);

  const assignForm = useForm<AssignPersonaFormValues>({
    resolver: zodResolver(assignPersonaSchema),
    defaultValues: {
      user_id: "",
      persona: selectedPersona,
      commission_base_bps: "",
      commission_min_bps: "",
      commission_max_bps: "",
      effective_from: todayDateInputValue(),
      effective_to: "",
    },
  });

  const editForm = useForm<EditPersonaFormValues>({
    resolver: zodResolver(editPersonaSchema),
    defaultValues: {
      commission_base_bps: "",
      commission_min_bps: "",
      commission_max_bps: "",
      effective_from: todayDateInputValue(),
      effective_to: "",
    },
  });

  useEffect(() => {
    if (!isAssignDialogOpen) {
      return;
    }

    assignForm.reset({
      user_id: "",
      persona: selectedPersona,
      commission_base_bps: "",
      commission_min_bps: "",
      commission_max_bps: "",
      effective_from: todayDateInputValue(),
      effective_to: "",
    });
  }, [assignForm, isAssignDialogOpen, selectedPersona]);

  useEffect(() => {
    if (!editingProfile) {
      return;
    }

    editForm.reset({
      commission_base_bps:
        editingProfile.commission_base_bps !== undefined
          ? String(editingProfile.commission_base_bps)
          : "",
      commission_min_bps:
        editingProfile.commission_min_bps !== undefined
          ? String(editingProfile.commission_min_bps)
          : "",
      commission_max_bps:
        editingProfile.commission_max_bps !== undefined
          ? String(editingProfile.commission_max_bps)
          : "",
      effective_from: toDateInputValue(editingProfile.effective_from),
      effective_to: toDateInputValue(editingProfile.effective_to),
    });
  }, [editForm, editingProfile]);

  async function onAssignSubmit(values: AssignPersonaFormValues) {
    try {
      await assignPersona({
        user_id: values.user_id as Id<"users">,
        persona: values.persona,
        commission_base_bps: values.commission_base_bps?.trim()
          ? Number(values.commission_base_bps)
          : undefined,
        commission_min_bps: values.commission_min_bps?.trim()
          ? Number(values.commission_min_bps)
          : undefined,
        commission_max_bps: values.commission_max_bps?.trim()
          ? Number(values.commission_max_bps)
          : undefined,
        effective_from: dateInputToStartOfDayMs(values.effective_from),
        effective_to: values.effective_to ? dateInputToEndOfDayMs(values.effective_to) : undefined,
      });

      toast.success("Persona assigned");
      setIsAssignDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to assign persona");
    }
  }

  async function onEditSubmit(values: EditPersonaFormValues) {
    if (!editingProfile) {
      return;
    }

    try {
      await updatePersona({
        id: editingProfile._id,
        commission_base_bps: values.commission_base_bps?.trim()
          ? Number(values.commission_base_bps)
          : undefined,
        commission_min_bps: values.commission_min_bps?.trim()
          ? Number(values.commission_min_bps)
          : undefined,
        commission_max_bps: values.commission_max_bps?.trim()
          ? Number(values.commission_max_bps)
          : undefined,
        effective_from: dateInputToStartOfDayMs(values.effective_from),
        effective_to: values.effective_to ? dateInputToEndOfDayMs(values.effective_to) : undefined,
      });

      toast.success("Persona profile updated");
      setEditingProfile(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update persona profile");
    }
  }

  async function handleDeactivate() {
    if (!deactivateTarget) {
      return;
    }

    setIsDeactivating(true);
    try {
      await deactivatePersona({ id: deactivateTarget._id });
      toast.success("Persona profile deactivated");
      setDeactivateTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to deactivate persona profile");
    } finally {
      setIsDeactivating(false);
    }
  }

  if (profilesPage === undefined) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const profiles = profilesPage.page;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={selectedPersona}
            onValueChange={(value) => setSelectedPersona(value as IncentivePersona)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Select persona" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(INCENTIVE_PERSONA).map((persona) => (
                <SelectItem key={persona} value={persona}>
                  {persona}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="text-slate-600">
            {profiles.length} active profile{profiles.length === 1 ? "" : "s"}
          </Badge>
        </div>

        {canConfigure ? (
          <Button type="button" onClick={() => setIsAssignDialogOpen(true)}>
            <Plus className="size-4" />
            Assign Persona
          </Button>
        ) : null}
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Actor Profiles</CardTitle>
          <CardDescription>
            Active actor assignments for <span className="font-semibold">{selectedPersona}</span>{" "}
            persona.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              No active actor profiles found for this persona.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="px-3 py-2.5 font-medium">User</th>
                    <th className="px-3 py-2.5 font-medium">Persona</th>
                    <th className="px-3 py-2.5 font-medium">Commission Base</th>
                    <th className="px-3 py-2.5 font-medium">Is Active</th>
                    <th className="px-3 py-2.5 font-medium">Effective From</th>
                    <th className="px-3 py-2.5 font-medium">Created</th>
                    <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile._id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-3 py-2.5">
                        <UserDisplayCell
                          userId={profile.user_id}
                          canResolveUserNames={canResolveUserNames}
                          userOption={userOptionMap.get(profile.user_id)}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="text-slate-700">
                          {profile.persona}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        {formatBpsPercent(profile.commission_base_bps)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge
                          className={
                            profile.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }
                        >
                          {profile.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">{formatDate(profile.effective_from)}</td>
                      <td className="px-3 py-2.5">{formatDateTime(profile.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {canConfigure ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingProfile(profile)}
                            >
                              Edit
                            </Button>
                          ) : null}
                          {canConfigure ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setDeactivateTarget(profile)}
                            >
                              Deactivate
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Persona</DialogTitle>
            <DialogDescription>
              Assign a user to a persona track with commission bounds and effective window.
            </DialogDescription>
          </DialogHeader>

          <Form {...assignForm}>
            <form
              onSubmit={assignForm.handleSubmit(onAssignSubmit)}
              className="space-y-4"
              noValidate
            >
              <FormField
                control={assignForm.control}
                name="user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>User</FormLabel>
                    <FormControl>
                      <UserCombobox
                        value={field.value}
                        onChange={field.onChange}
                        options={userOptions}
                        disabled={assignForm.formState.isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={assignForm.control}
                name="persona"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Persona</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select persona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.values(INCENTIVE_PERSONA).map((persona) => (
                          <SelectItem key={persona} value={persona}>
                            {persona}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-3 sm:grid-cols-3">
                <FormField
                  control={assignForm.control}
                  name="commission_base_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Base BPS</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          inputMode="numeric"
                          placeholder="1500"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={assignForm.control}
                  name="commission_min_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Min BPS</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          inputMode="numeric"
                          placeholder="1000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={assignForm.control}
                  name="commission_max_bps"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max BPS</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          inputMode="numeric"
                          placeholder="2000"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <FormField
                  control={assignForm.control}
                  name="effective_from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Effective From</FormLabel>
                      <FormControl>
                        <DatePicker value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={assignForm.control}
                  name="effective_to"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Effective To (optional)</FormLabel>
                        {field.value ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => field.onChange("")}
                          >
                            Clear
                          </Button>
                        ) : null}
                      </div>
                      <FormControl>
                        <DatePicker value={field.value} onChange={field.onChange} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAssignDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={assignForm.formState.isSubmitting || userOptions.length === 0}
                >
                  {assignForm.formState.isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    "Assign Persona"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingProfile !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProfile(null);
          }
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Persona Profile</DialogTitle>
            <DialogDescription>
              Update commission bounds and active window for this assignment.
            </DialogDescription>
          </DialogHeader>

          {editingProfile ? (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4" noValidate>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="text-slate-500">User</p>
                  <div className="font-medium text-slate-900">
                    <UserDisplayCell
                      userId={editingProfile.user_id}
                      canResolveUserNames={canResolveUserNames}
                      userOption={userOptionMap.get(editingProfile.user_id)}
                    />
                  </div>
                  <p className="mt-2 text-slate-500">Persona</p>
                  <p className="font-medium text-slate-900">{editingProfile.persona}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField
                    control={editForm.control}
                    name="commission_base_bps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base BPS</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            inputMode="numeric"
                            placeholder="1500"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="commission_min_bps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Min BPS</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            inputMode="numeric"
                            placeholder="1000"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="commission_max_bps"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max BPS</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            inputMode="numeric"
                            placeholder="2000"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField
                    control={editForm.control}
                    name="effective_from"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Effective From</FormLabel>
                        <FormControl>
                          <DatePicker value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="effective_to"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>Effective To (optional)</FormLabel>
                          {field.value ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => field.onChange("")}
                            >
                              Clear
                            </Button>
                          ) : null}
                        </div>
                        <FormControl>
                          <DatePicker value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditingProfile(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={editForm.formState.isSubmitting}>
                    {editForm.formState.isSubmitting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Changes"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate persona profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This marks the profile as inactive and removes it from the active persona table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeactivate} disabled={isDeactivating}>
              {isDeactivating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Deactivating...
                </>
              ) : (
                "Deactivate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
