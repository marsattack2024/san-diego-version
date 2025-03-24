# Frontend Guidelines

## Design System

### Typography

#### Font Families
- **Primary (Sans)**: `geist` with fallbacks:
  - Inter
  - Segoe UI
  - Helvetica Neue
  - Arial
  - system-ui
  
- **Monospace**: `geist-mono` with fallbacks:
  - JetBrains Mono
  - Menlo
  - Monaco
  - Consolas
  - Courier New

### Color System

The application uses CSS variables for theming with both light and dark mode support. Colors are defined as HSL values and accessed through Tailwind classes.

#### Base Colors
```css
--background: Light(0 0% 100%) / Dark(240 10% 3.9%)
--foreground: Light(240 10% 3.9%) / Dark(0 0% 98%)
--primary: Light(240 5.9% 10%) / Dark(0 0% 98%)
--secondary: Light(240 4.8% 95.9%) / Dark(240 3.7% 15.9%)
--muted: Light(240 4.8% 95.9%) / Dark(240 3.7% 15.9%)
--accent: Light(240 4.8% 95.9%) / Dark(240 3.7% 15.9%)
--destructive: Light(0 84.2% 60.2%) / Dark(0 62.8% 30.6%)
```

#### Semantic Colors
```css
--card: Background for card components
--popover: Background for popover elements
--border: Border colors
--input: Form input backgrounds
--ring: Focus ring color
```

#### Sidebar-specific Colors
```css
--sidebar-background
--sidebar-foreground
--sidebar-primary
--sidebar-accent
--sidebar-border
--sidebar-ring
```

### Spacing & Layout

#### Grid System
- Based on a 4px (0.25rem) grid
- Tailwind's spacing scale is used consistently
- Common spacing values:
  - 2: 0.5rem (8px)
  - 4: 1rem (16px)
  - 6: 1.5rem (24px)
  - 8: 2rem (32px)

#### Layout Components
- Use CSS Grid for page layouts
- Flexbox for component layouts
- Responsive breakpoints:
  - sm: 640px
  - md: 768px
  - lg: 1024px
  - xl: 1280px
  - 2xl: 1536px
  - toast-mobile: 600px (custom)

### Components

#### UI Library
The application uses `shadcn/ui` components with customized variants. Key components include:

##### Button
```typescript
variants: {
  default: 'bg-primary text-primary-foreground'
  destructive: 'bg-destructive text-destructive-foreground'
  outline: 'border border-input bg-background'
  secondary: 'bg-secondary text-secondary-foreground'
  ghost: 'hover:bg-accent hover:text-accent-foreground'
  link: 'text-primary underline-offset-4 hover:underline'
}
```

##### Alert
```typescript
variants: {
  default: 'bg-background text-foreground'
  destructive: 'border-destructive/50 text-destructive'
}
```

##### Badge
```typescript
variants: {
  default: 'bg-primary text-primary-foreground'
  secondary: 'bg-secondary text-secondary-foreground'
  destructive: 'bg-destructive text-destructive-foreground'
  outline: 'text-foreground'
}
```

### Icons
- Primary: `lucide-react`
- Secondary: `@tabler/icons-react`
- Additional: `@radix-ui/react-icons` for specific components

### Animation & Transitions

#### Standard Transitions
- Duration: 200ms-300ms
- Timing: ease-linear for layout changes
- Common transitions:
  - colors
  - opacity
  - transform
  - width/height

#### Loading States
```css
.thinking-dot {
  animation: blink 1.2s infinite ease-in-out;
}

.deepsearch-dot {
  animation: pulse-fade 1.4s infinite ease-in-out;
}
```

### Accessibility

- WCAG 2.1 AA compliance required
- Minimum contrast ratio: 4.5:1
- Keyboard navigation support
- Proper ARIA attributes
- Semantic HTML elements

### Best Practices

1. **CSS Organization**
   - Use Tailwind utility classes
   - Follow mobile-first responsive design
   - Maintain dark/light mode compatibility

2. **Component Structure**
   - Single responsibility principle
   - Composition over inheritance
   - Proper TypeScript interfaces for props

3. **Performance**
   - Lazy load components when appropriate
   - Optimize images
   - Minimize bundle size
   - Monitor Core Web Vitals

4. **State Management**
   - Prefer React hooks over globals
   - Keep state close to where it's used
   - Use context for shared state

5. **Code Style**
   - PascalCase for components
   - camelCase for functions and variables
   - kebab-case for CSS classes
