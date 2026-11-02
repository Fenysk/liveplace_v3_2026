import { ACCOUNT_DELETION_TRIGGERS } from "@liveplace/domain";
import { describe, expect, it } from "vitest";
import { accountDeletionTrigger } from "../convex/schema";

describe("the triggers of the account deletions table (CDC §8)", () => {
  // Convex ne voit pas `domain` : ses déclencheurs sont recopiés, et rien d'autre ne garde les deux listes ensemble
  it("are the triggers of the domain", () => {
    expect(accountDeletionTrigger.members.map((member) => member.value)).toEqual([
      ...ACCOUNT_DELETION_TRIGGERS,
    ]);
  });
});
