# Component Catalog

Use this catalog when deciding whether the design system has enough coverage for upcoming prototypes. Copy only the components the project needs into `.supervibe/artifacts/prototypes/_design-system/components/`, then specify anatomy, states, variants, tokens, and accessibility for each.

## Core

- Button
- Icon button
- Link
- Badge
- Card
- Divider
- Avatar
- Tooltip

## Navigation

- Topbar
- Sidebar
- Breadcrumb
- Tabs
- Pagination
- Stepper
- Command palette
- Dropdown menu
- Context menu

## Forms

- Input
- Textarea
- Select
- Combobox
- Checkbox
- Radio
- Toggle
- Slider
- Date picker
- File upload
- Search box
- Validation summary

## Disclosure

- Accordion
- Popover
- Drawer
- Sheet
- Modal
- Hover card
- Split pane

## Feedback

- Toast
- Alert
- Banner
- Inline error
- Confirmation dialog
- Progress
- Skeleton
- Loading overlay
- Empty state

## Data Display

- Data table
- Metric card
- Chart shell
- Timeline
- Activity feed
- Status indicator
- Tag list
- Detail list

## Media

- Image frame
- Gallery
- Video poster block
- Before/after compare
- Lottie/SVG animation slot

## Layout Shells

- Page shell
- Dashboard grid
- Settings shell
- Auth shell
- Marketing section
- Responsive two-pane layout

## Required State Contract

Every interactive component must document:

- idle
- hover
- active
- focus-visible
- disabled
- loading where applicable
- error where applicable
- empty or no-data where applicable

Every component must list exact token dependencies and whether it is custom, library-inherited, or library-overridden.
