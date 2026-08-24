import { ArchiveIcon } from "lucide-react";

export function ArchivedNotice({
  societyName,
  buildingName,
}: {
  societyName: string;
  buildingName: string;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <ArchiveIcon className="size-10 text-muted-foreground" />
      </div>
      <h1 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
        No Longer Available
      </h1>
      <p className="mb-2 max-w-md text-base text-muted-foreground">
        This listing at {buildingName}, {societyName} is no longer available for rent.
      </p>
      <p className="max-w-md text-sm text-muted-foreground/70">
        It may have been rented out or removed by the owner. Browse other listings to find your next
        home.
      </p>
    </div>
  );
}
