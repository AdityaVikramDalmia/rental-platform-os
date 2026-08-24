"use client";

import { Briefcase, CalendarDays, UserCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RoommateProfile = {
  _id: string;
  name_alias: string;
  age_range?: string;
  gender?: string;
  profession?: string;
  lifestyle_tags?: string[];
  bio?: string;
  move_in_date?: number;
};

type RoommateProfilesProps = {
  profiles?: RoommateProfile[];
};

function formatMoveInDate(moveInDate: number): string {
  return new Date(moveInDate).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RoommateProfiles({ profiles }: RoommateProfilesProps) {
  if (!profiles || profiles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Current Roommates</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {profiles.map((profile) => (
          <Card key={profile._id} className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCircle2 className="size-5 text-muted-foreground" />
                {profile.name_alias}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 text-sm text-muted-foreground">
                {profile.age_range && <p>Age: {profile.age_range}</p>}
                {profile.gender && <p>Gender: {profile.gender}</p>}
                {profile.profession && (
                  <p className="inline-flex items-center gap-1.5">
                    <Briefcase className="size-3.5" />
                    {profile.profession}
                  </p>
                )}
                {profile.move_in_date && (
                  <p className="inline-flex items-center gap-1.5">
                    <CalendarDays className="size-3.5" />
                    Moved in: {formatMoveInDate(profile.move_in_date)}
                  </p>
                )}
              </div>

              {profile.bio && (
                <p className="text-sm leading-relaxed text-foreground">{profile.bio}</p>
              )}

              {profile.lifestyle_tags && profile.lifestyle_tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {profile.lifestyle_tags.map((tag) => (
                    <Badge key={`${profile._id}-${tag}`} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
