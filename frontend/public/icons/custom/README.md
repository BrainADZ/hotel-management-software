# UI icons

Feature and service icons use Lucide React through the shared `AppGlyph`
component in `frontend/app/hotel-platform.tsx`.

Add or change semantic icon mappings in `frontend/lib/app-icons.ts`.
Each rendered SVG has a `data-icon` attribute identifying its key and inherits
its color from the surrounding UI. Custom image files are no longer needed.
