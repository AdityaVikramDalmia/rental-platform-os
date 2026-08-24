import { notFound } from "next/navigation";
import DevLoginClient from "./dev-login-client";
import { getMoreAccountSummaries, getQuickAccessAccountSummaries } from "./accounts";
import { isDevLoginEnabled } from "../../../../lib/localAuthConfig";

/**
 * Server component on purpose: the demo account catalog holds passwords and is
 * resolved server-side only. The client receives labels/icons, never credentials.
 */
function DevLoginPage() {
  if (!isDevLoginEnabled()) {
    notFound();
  }

  const localAuthEnabled =
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_LOCAL_AUTH === "true";

  return (
    <DevLoginClient
      quickAccessAccounts={getQuickAccessAccountSummaries()}
      moreAccounts={getMoreAccountSummaries()}
      localAuthEnabled={localAuthEnabled}
    />
  );
}

export default DevLoginPage;
