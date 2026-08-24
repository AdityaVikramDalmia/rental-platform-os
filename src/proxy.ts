import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export const proxy = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: [
      "/",
      "/guard/login",
      "/admin/login",
      "/ops/login",
      "/callback",
      "/post-auth",
      "/listing/(.*)",
      "/listings(.*)",
      "/homepage",
      "/how-it-works",
      "/contact",
      "/ref(.*)",
      "/invite/(.*)",
      "/tools",
      "/owner-services",
      "/healthz",
      "/dev/(.*)",
      "/sso/jwks/(.*)",
      "/~offline",
    ],
  },
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
