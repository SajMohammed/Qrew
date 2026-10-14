import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/react";

type Appearance = ComponentProps<typeof ClerkProvider>["appearance"];

const pill = "var(--radius-pill)";

/**
 * Clerk's sign-in, avatar menu and account modal, dressed in Softform.
 *
 * Every value is a Softform CSS variable, so Clerk follows the app's light/dark switch (`.dark` on
 * <html>) on its own. Shapes are set per element rather than through Softform's `sf-` classes: Clerk's
 * own styles would outrank those in the cascade.
 *
 * Lime is a fill here too, never text: Clerk paints links and badges in `colorPrimary`, so those take
 * `signature-ink` instead.
 */
export const softformAppearance: Appearance = {
  variables: {
    colorPrimary: "var(--signature)",
    colorPrimaryForeground: "var(--on-signature)",
    colorBackground: "var(--surface)",
    colorForeground: "var(--ink)",
    colorMuted: "var(--surface-sunken)",
    colorMutedForeground: "var(--ink-2)",
    colorNeutral: "var(--ink)",
    colorInput: "var(--surface-sunken)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--signature-ink)",
    colorWarning: "var(--warning)",
    colorRing: "var(--focus)",
    colorModalBackdrop: "rgba(10, 14, 10, 0.3)",
    fontFamily: "var(--font-sans)",
    fontFamilyButtons: "var(--font-sans)",
    fontWeight: { normal: 400, medium: 500, semibold: 500, bold: 500 },
    borderRadius: "var(--radius-sm)",
  },
  elements: {
    // Cards: Softform's solid object — no border, a soft shadow, 28px corners.
    cardBox: { borderRadius: "var(--radius-lg)", border: "none", boxShadow: "var(--shadow-2)" },
    card: { border: "none", boxShadow: "none" },
    headerTitle: { fontSize: "19px", letterSpacing: "-0.01em" },
    headerSubtitle: { color: "var(--ink-2)" },
    footer: { background: "var(--surface-sunken)" },
    // Controls are pills; fields are sunken wells that brighten on focus.
    socialButtonsBlockButton: {
      borderRadius: pill,
      minHeight: "var(--control-md)",
      border: "none",
      background: "var(--surface-sunken)",
      boxShadow: "none",
    },
    formButtonPrimary: {
      borderRadius: pill,
      minHeight: "var(--control-md)",
      fontSize: "15px",
      textTransform: "none",
      boxShadow: "var(--shadow-signature)",
      "&::after": { display: "none" },
    },
    formFieldInput: {
      borderRadius: "var(--radius-md)",
      minHeight: "var(--control-md)",
      border: "none",
      boxShadow: "none",
      "&:focus": { background: "var(--surface)", boxShadow: "var(--shadow-1)" },
    },
    footerActionLink: { color: "var(--signature-ink)" },
    formFieldAction: { color: "var(--signature-ink)" },
    // The avatar menu: Softform's frosted menu, 18px corners, no rules between rows.
    userButtonAvatarBox: { width: "40px", height: "40px" },
    userButtonPopoverCard: {
      borderRadius: "var(--radius-md)",
      border: "none",
      background: "var(--glass-strong)",
      backdropFilter: "blur(var(--blur-glass)) saturate(1.6)",
      boxShadow: "var(--shadow-2)",
    },
    userButtonPopoverActions: { borderTop: "none", padding: "0 6px 6px" },
    userButtonPopoverActionButton: { borderTop: "none", borderRadius: "var(--radius-sm)", minHeight: "40px" },
    userButtonPopoverFooter: { background: "transparent", borderTop: "none" },
    // The account modal.
    modalContent: { borderRadius: "var(--radius-xl)" },
    profileSectionPrimaryButton: { color: "var(--signature-ink)", borderRadius: pill },
    menuButton__connectedAccounts: { color: "var(--signature-ink)" },
    // The current section goes ink on a white pill, like the current item in Softform's nav.
    navbarButton: {
      borderRadius: pill,
      "&.cl-active": { color: "var(--ink)", background: "var(--surface)", boxShadow: "var(--shadow-1)" },
    },
    badge: { background: "var(--signature-soft)", color: "var(--signature-ink)", border: "none" },
  },
};
