# Custom UI icons

Place your SVG, PNG or WebP icons in this directory.
Then add their URLs to `frontend/lib/custom-icons.ts`, for example:

```ts
hotel: "/icons/custom/hotel.svg",
"booking-calendar": "/icons/custom/booking-calendar.svg",
restaurant: "/icons/custom/restaurant.svg",
```

Each empty placeholder has a `data-icon` attribute identifying its key.
The complete list of keys is the `AppGlyphName` type in
`frontend/app/hotel-platform.tsx`.

An unmapped key stays an empty outlined placeholder. Mapped images fit the
existing icon size automatically. Use a square image with a transparent background.
