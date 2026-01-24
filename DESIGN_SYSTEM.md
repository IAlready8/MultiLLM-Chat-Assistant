# Design System Documentation

## Overview
This document outlines the design system for the Personal LLM Tool, built on modern, industry-standard foundations.

## Core Technologies
- **Radix UI**: Headless component primitives for accessibility and behavior
- **Tailwind CSS**: Utility-first CSS framework for styling
- **Class Variance Authority (CVA)**: Type-safe variant handling
- **Next Themes**: Theme switching capabilities

## Component Library
Located in `/components/ui/`, containing 17+ reusable components:
- button.tsx, card.tsx, dialog.tsx, input.tsx
- alert-dialog.tsx, dropdown-menu.tsx, select.tsx, tabs.tsx
- avatar.tsx, badge.tsx, slider.tsx, toast.tsx
- And more including chart.tsx

## Design Tokens
Defined in `tailwind.config.ts` and `app/globals.css`:
- Semantic color tokens (primary, secondary, muted, accent, destructive)
- Theme-aware variables using CSS custom properties
- Dark/light mode variants with consistent naming
- Spacing & border radius tokens (--radius system)

## Styling Architecture
- Consistent utility patterns using `cn()` helper
- Component variants via CVA
- Custom design elements including rainbow outline effects and ambient orbs
- Animation system with Tailwind animate plugin

## Development Guidelines
1. Leverage existing components - check `/components/ui/` first
2. Follow variant patterns - use the CVA system for component variations
3. Use design tokens - reference CSS variables for colors and spacing
4. Maintain consistency - follow the established `cn()` utility pattern

## Key Benefits for AI Code Generation
1. Predictable Patterns - All components follow the same structure and naming conventions
2. Type Safety - Full TypeScript support with variant props
3. Accessibility - Radix UI provides ARIA compliance out of the box
4. Theme Consistency - Centralized design tokens ensure visual consistency
5. Extensibility - CVA allows easy addition of new variants

## Recommendations for Development
1. Leverage existing components - Always check `/components/ui/` before creating new ones
2. Follow variant patterns - Use the CVA system for component variations
3. Use design tokens - Reference CSS variables for colors and spacing
4. Maintain consistency - Follow the established `cn()` utility pattern for class merging

This is a professional-grade design system that will enable consistent, accessible, and maintainable UI development across your entire application.