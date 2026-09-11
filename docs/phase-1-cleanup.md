# Phase 1 cleanup evidence

The Vite entry is `Frontend/index.html` → `src/main.tsx`. Static imports, re-exports and dynamic imports reach only Button, Dialog and Tabs from the former 61-file UI catalogue, plus the shared class-name utility. The other 58 UI files and the mobile hook are unreachable. Tailwind explicitly scans the same three UI components.

The Next.js app, its stylesheet/vendor CSS, unused Sites Vite plugin and old installer/framework scripts are absent from the active package scripts, Vite configuration, Express imports, Docker build and Render configuration. The obsolete configure-project script would recreate the old layout. None provides active authentication: application auth remains in Backend/src/routes/auth.routes.ts and middleware/auth.middleware.ts.

All D1 database scaffold source was preserved under Backend/legacy instead of deleted. Existing public assets were preserved. Existing ignored runtime/data/output directories were not removed.

Removed files:

- `Frontend/src/components/ui/AlertDialog.tsx`
- `Frontend/src/components/ui/AspectRatio.tsx`
- `Frontend/src/components/ui/ButtonGroup.tsx`
- `Frontend/src/components/ui/ContextMenu.tsx`
- `Frontend/src/components/ui/DropdownMenu.tsx`
- `Frontend/src/components/ui/HoverCard.tsx`
- `Frontend/src/components/ui/InputGroup.tsx`
- `Frontend/src/components/ui/InputOtp.tsx`
- `Frontend/src/components/ui/MessageScroller.tsx`
- `Frontend/src/components/ui/NativeSelect.tsx`
- `Frontend/src/components/ui/NavigationMenu.tsx`
- `Frontend/src/components/ui/RadioGroup.tsx`
- `Frontend/src/components/ui/ScrollArea.tsx`
- `Frontend/src/components/ui/ToggleGroup.tsx`
- `Frontend/src/components/ui/accordion.tsx`
- `Frontend/src/components/ui/alert.tsx`
- `Frontend/src/components/ui/attachment.tsx`
- `Frontend/src/components/ui/avatar.tsx`
- `Frontend/src/components/ui/badge.tsx`
- `Frontend/src/components/ui/breadcrumb.tsx`
- `Frontend/src/components/ui/bubble.tsx`
- `Frontend/src/components/ui/calendar.tsx`
- `Frontend/src/components/ui/card.tsx`
- `Frontend/src/components/ui/carousel.tsx`
- `Frontend/src/components/ui/chart.tsx`
- `Frontend/src/components/ui/checkbox.tsx`
- `Frontend/src/components/ui/collapsible.tsx`
- `Frontend/src/components/ui/combobox.tsx`
- `Frontend/src/components/ui/command.tsx`
- `Frontend/src/components/ui/direction.tsx`
- `Frontend/src/components/ui/drawer.tsx`
- `Frontend/src/components/ui/empty.tsx`
- `Frontend/src/components/ui/field.tsx`
- `Frontend/src/components/ui/form.tsx`
- `Frontend/src/components/ui/input.tsx`
- `Frontend/src/components/ui/item.tsx`
- `Frontend/src/components/ui/kbd.tsx`
- `Frontend/src/components/ui/label.tsx`
- `Frontend/src/components/ui/marker.tsx`
- `Frontend/src/components/ui/menubar.tsx`
- `Frontend/src/components/ui/message.tsx`
- `Frontend/src/components/ui/pagination.tsx`
- `Frontend/src/components/ui/popover.tsx`
- `Frontend/src/components/ui/progress.tsx`
- `Frontend/src/components/ui/resizable.tsx`
- `Frontend/src/components/ui/select.tsx`
- `Frontend/src/components/ui/separator.tsx`
- `Frontend/src/components/ui/sheet.tsx`
- `Frontend/src/components/ui/sidebar.tsx`
- `Frontend/src/components/ui/skeleton.tsx`
- `Frontend/src/components/ui/slider.tsx`
- `Frontend/src/components/ui/sonner.tsx`
- `Frontend/src/components/ui/spinner.tsx`
- `Frontend/src/components/ui/switch.tsx`
- `Frontend/src/components/ui/table.tsx`
- `Frontend/src/components/ui/textarea.tsx`
- `Frontend/src/components/ui/toggle.tsx`
- `Frontend/src/components/ui/tooltip.tsx`
- `Frontend/src/hooks/use-mobile.ts`
- `app/chatgpt-auth.ts`
- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `build/sites-vite-plugin.LICENSE`
- `build/sites-vite-plugin.ts`
- `next.config.ts`
- `scripts/build-verified.sh`
- `scripts/configure-project.mjs`
- `scripts/execution-profile.mjs`
- `scripts/install-ci.mjs`
- `scripts/install-ci.sh`
- `scripts/install-pnpm.sh`
- `scripts/pnpm-install.mjs`
- `scripts/run-framework.mjs`
- `scripts/sites-env.mjs`
- `scripts/sites-env.sh`
- `vendor/shadcn-tailwind-4.13.0.LICENSE.md`
- `vendor/shadcn-tailwind-4.13.0.css`
