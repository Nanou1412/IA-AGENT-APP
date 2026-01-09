/**
 * Menu Configuration Types and Validation
 * 
 * Defines the structure of menuConfig stored in OrgSettings.
 * Used by the takeaway_order engine module for menu-based ordering.
 * 
 * Features:
 * - Categories with items
 * - Price in cents (for precision)
 * - Options/modifiers support
 * - Availability windows
 * - Dietary/allergen flags
 */

// ============================================================================
// Types
// ============================================================================

/**
 * A single option/modifier for a menu item
 * Example: Size (Small, Medium, Large) or Extras (Add cheese +$2)
 */
export interface MenuItemOption {
  /** Unique ID for this option */
  id: string;
  /** Display name */
  name: string;
  /** Price modifier in cents (can be 0 for free options) */
  priceCents: number;
}

/**
 * A group of options (radio = pick one, checkbox = pick multiple)
 * Example: "Size" (radio) or "Extras" (checkbox)
 */
export interface MenuOptionGroup {
  /** Unique ID for this group */
  id: string;
  /** Display name */
  name: string;
  /** Selection type: radio = pick one, checkbox = pick multiple */
  type: 'radio' | 'checkbox';
  /** Is this required? */
  required: boolean;
  /** Available options */
  options: MenuItemOption[];
  /** Default option ID (for radio groups) */
  defaultOptionId?: string;
}

/**
 * A single menu item
 */
export interface MenuItem {
  /** Unique ID for this item */
  id: string;
  /** Display name */
  name: string;
  /** Short description */
  description?: string;
  /** Base price in cents */
  priceCents: number;
  /** Category ID this item belongs to */
  categoryId: string;
  /** Is this item currently available? */
  available: boolean;
  /** Optional: specific availability hours (e.g., "lunch only") */
  availableHours?: {
    start: string; // HH:mm format
    end: string;
  };
  /** Dietary flags */
  dietary?: {
    vegetarian?: boolean;
    vegan?: boolean;
    glutenFree?: boolean;
    dairyFree?: boolean;
    nutFree?: boolean;
    halal?: boolean;
    kosher?: boolean;
  };
  /** Allergen warnings */
  allergens?: string[];
  /** Option groups for this item */
  optionGroups?: MenuOptionGroup[];
  /** Keywords for matching (e.g., ["burger", "hamburger", "patty"]) */
  keywords?: string[];
  /** Sort order within category */
  sortOrder?: number;
}

/**
 * A menu category
 */
export interface MenuCategory {
  /** Unique ID for this category */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Sort order */
  sortOrder?: number;
  /** Is this category currently available? */
  available: boolean;
}

/**
 * Full menu configuration
 */
export interface MenuConfig {
  /** Whether menu-based ordering is enabled */
  enabled: boolean;
  /** Menu version (for cache invalidation) */
  version: string;
  /** Currency code (ISO 4217) */
  currency: string;
  /** Categories */
  categories: MenuCategory[];
  /** Menu items */
  items: MenuItem[];
  /** Pricing mode: 'menu' uses menu prices, 'manual' asks for total */
  pricingMode: 'menu' | 'manual';
  /** Allow items not on the menu? */
  allowOffMenuItems: boolean;
  /** Message when item not found */
  itemNotFoundMessage: string;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_MENU_CONFIG: MenuConfig = {
  enabled: false,
  version: '1.0.0',
  currency: 'AUD',
  categories: [],
  items: [],
  pricingMode: 'manual',
  allowOffMenuItems: true,
  itemNotFoundMessage: "I couldn't find that item on our menu. Could you please check the name or describe what you'd like?",
};

/**
 * Sample menu for testing/demo purposes
 */
export const SAMPLE_MENU_CONFIG: MenuConfig = {
  enabled: true,
  version: '1.0.0',
  currency: 'AUD',
  pricingMode: 'menu',
  allowOffMenuItems: false,
  itemNotFoundMessage: "Sorry, I couldn't find that on our menu. Would you like me to tell you what we have available?",
  categories: [
    {
      id: 'mains',
      name: 'Main Courses',
      description: 'Our signature dishes',
      sortOrder: 1,
      available: true,
    },
    {
      id: 'sides',
      name: 'Sides',
      description: 'Perfect accompaniments',
      sortOrder: 2,
      available: true,
    },
    {
      id: 'drinks',
      name: 'Drinks',
      description: 'Refreshing beverages',
      sortOrder: 3,
      available: true,
    },
  ],
  items: [
    {
      id: 'burger',
      name: 'Classic Burger',
      description: 'Beef patty with lettuce, tomato, and our special sauce',
      priceCents: 1850,
      categoryId: 'mains',
      available: true,
      dietary: { glutenFree: false },
      allergens: ['gluten', 'dairy'],
      keywords: ['hamburger', 'beef burger', 'cheeseburger'],
      optionGroups: [
        {
          id: 'size',
          name: 'Size',
          type: 'radio',
          required: true,
          defaultOptionId: 'regular',
          options: [
            { id: 'regular', name: 'Regular', priceCents: 0 },
            { id: 'large', name: 'Large', priceCents: 400 },
          ],
        },
        {
          id: 'extras',
          name: 'Extras',
          type: 'checkbox',
          required: false,
          options: [
            { id: 'cheese', name: 'Add Cheese', priceCents: 200 },
            { id: 'bacon', name: 'Add Bacon', priceCents: 350 },
            { id: 'egg', name: 'Add Egg', priceCents: 250 },
          ],
        },
      ],
      sortOrder: 1,
    },
    {
      id: 'fish-chips',
      name: 'Fish & Chips',
      description: 'Beer-battered fish with crispy chips',
      priceCents: 2200,
      categoryId: 'mains',
      available: true,
      dietary: { glutenFree: false },
      allergens: ['gluten', 'fish'],
      keywords: ['fish and chips', 'battered fish'],
      sortOrder: 2,
    },
    {
      id: 'chicken-parma',
      name: 'Chicken Parmigiana',
      description: 'Crumbed chicken with ham, cheese, and napoli sauce',
      priceCents: 2400,
      categoryId: 'mains',
      available: true,
      dietary: { glutenFree: false },
      allergens: ['gluten', 'dairy'],
      keywords: ['parma', 'parmi', 'chicken parmi', 'schnitzel'],
      sortOrder: 3,
    },
    {
      id: 'chips',
      name: 'Chips',
      description: 'Crispy golden chips',
      priceCents: 800,
      categoryId: 'sides',
      available: true,
      dietary: { vegetarian: true, vegan: true, glutenFree: true },
      keywords: ['fries', 'french fries', 'hot chips'],
      sortOrder: 1,
    },
    {
      id: 'salad',
      name: 'Garden Salad',
      description: 'Fresh mixed leaves with house dressing',
      priceCents: 950,
      categoryId: 'sides',
      available: true,
      dietary: { vegetarian: true, vegan: true, glutenFree: true },
      keywords: ['green salad', 'side salad'],
      sortOrder: 2,
    },
    {
      id: 'soft-drink',
      name: 'Soft Drink',
      description: 'Coca-Cola, Sprite, or Fanta',
      priceCents: 450,
      categoryId: 'drinks',
      available: true,
      dietary: { vegetarian: true, vegan: true, glutenFree: true },
      keywords: ['coke', 'cola', 'soda', 'lemonade'],
      optionGroups: [
        {
          id: 'type',
          name: 'Type',
          type: 'radio',
          required: true,
          defaultOptionId: 'coke',
          options: [
            { id: 'coke', name: 'Coca-Cola', priceCents: 0 },
            { id: 'sprite', name: 'Sprite', priceCents: 0 },
            { id: 'fanta', name: 'Fanta', priceCents: 0 },
          ],
        },
      ],
      sortOrder: 1,
    },
    {
      id: 'water',
      name: 'Bottled Water',
      description: 'Still or sparkling',
      priceCents: 350,
      categoryId: 'drinks',
      available: true,
      dietary: { vegetarian: true, vegan: true, glutenFree: true },
      keywords: ['mineral water', 'sparkling water'],
      sortOrder: 2,
    },
  ],
};

// ============================================================================
// Parsing / Validation
// ============================================================================

/**
 * Parse and validate menuConfig from JSON
 * Returns default config if invalid
 */
export function parseMenuConfig(configJson: unknown): MenuConfig {
  if (!configJson || typeof configJson !== 'object') {
    return DEFAULT_MENU_CONFIG;
  }

  const config = configJson as Record<string, unknown>;

  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : DEFAULT_MENU_CONFIG.enabled,
    version: typeof config.version === 'string' ? config.version : DEFAULT_MENU_CONFIG.version,
    currency: typeof config.currency === 'string' ? config.currency : DEFAULT_MENU_CONFIG.currency,
    categories: Array.isArray(config.categories) ? parseCategories(config.categories) : DEFAULT_MENU_CONFIG.categories,
    items: Array.isArray(config.items) ? parseItems(config.items) : DEFAULT_MENU_CONFIG.items,
    pricingMode: config.pricingMode === 'menu' || config.pricingMode === 'manual' 
      ? config.pricingMode 
      : DEFAULT_MENU_CONFIG.pricingMode,
    allowOffMenuItems: typeof config.allowOffMenuItems === 'boolean' 
      ? config.allowOffMenuItems 
      : DEFAULT_MENU_CONFIG.allowOffMenuItems,
    itemNotFoundMessage: typeof config.itemNotFoundMessage === 'string' 
      ? config.itemNotFoundMessage 
      : DEFAULT_MENU_CONFIG.itemNotFoundMessage,
  };
}

function parseCategories(categories: unknown[]): MenuCategory[] {
  return categories
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      id: String(c.id || ''),
      name: String(c.name || ''),
      description: typeof c.description === 'string' ? c.description : undefined,
      sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : undefined,
      available: typeof c.available === 'boolean' ? c.available : true,
    }))
    .filter((c) => c.id && c.name);
}

function parseItems(items: unknown[]): MenuItem[] {
  return items
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      id: String(i.id || ''),
      name: String(i.name || ''),
      description: typeof i.description === 'string' ? i.description : undefined,
      priceCents: typeof i.priceCents === 'number' ? i.priceCents : 0,
      categoryId: String(i.categoryId || ''),
      available: typeof i.available === 'boolean' ? i.available : true,
      dietary: typeof i.dietary === 'object' ? i.dietary as MenuItem['dietary'] : undefined,
      allergens: Array.isArray(i.allergens) ? i.allergens.map(String) : undefined,
      optionGroups: Array.isArray(i.optionGroups) ? parseOptionGroups(i.optionGroups) : undefined,
      keywords: Array.isArray(i.keywords) ? i.keywords.map(String) : undefined,
      sortOrder: typeof i.sortOrder === 'number' ? i.sortOrder : undefined,
      availableHours: typeof i.availableHours === 'object' ? i.availableHours as MenuItem['availableHours'] : undefined,
    }))
    .filter((i) => i.id && i.name);
}

function parseOptionGroups(groups: unknown[]): MenuOptionGroup[] {
  return groups
    .filter((g): g is Record<string, unknown> => typeof g === 'object' && g !== null)
    .map((g): MenuOptionGroup => ({
      id: String(g.id || ''),
      name: String(g.name || ''),
      type: g.type === 'checkbox' ? 'checkbox' : 'radio',
      required: typeof g.required === 'boolean' ? g.required : false,
      options: Array.isArray(g.options) ? parseOptions(g.options) : [],
      defaultOptionId: typeof g.defaultOptionId === 'string' ? g.defaultOptionId : undefined,
    }))
    .filter((g) => g.id && g.name && g.options.length > 0);
}

function parseOptions(options: unknown[]): MenuItemOption[] {
  return options
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    .map((o) => ({
      id: String(o.id || ''),
      name: String(o.name || ''),
      priceCents: typeof o.priceCents === 'number' ? o.priceCents : 0,
    }))
    .filter((o) => o.id && o.name);
}

// ============================================================================
// Menu Helpers
// ============================================================================

/**
 * Find a menu item by name or keywords (fuzzy matching)
 */
export function findMenuItem(menu: MenuConfig, searchTerm: string): MenuItem | null {
  const term = searchTerm.toLowerCase().trim();
  
  // First, try exact name match
  const exactMatch = menu.items.find(
    (item) => item.available && item.name.toLowerCase() === term
  );
  if (exactMatch) return exactMatch;
  
  // Then, try keyword match
  const keywordMatch = menu.items.find(
    (item) => item.available && item.keywords?.some((kw) => kw.toLowerCase() === term)
  );
  if (keywordMatch) return keywordMatch;
  
  // Then, try partial name match
  const partialMatch = menu.items.find(
    (item) => item.available && item.name.toLowerCase().includes(term)
  );
  if (partialMatch) return partialMatch;
  
  // Finally, try partial keyword match
  const partialKeywordMatch = menu.items.find(
    (item) => item.available && item.keywords?.some((kw) => kw.toLowerCase().includes(term))
  );
  if (partialKeywordMatch) return partialKeywordMatch;
  
  return null;
}

/**
 * Calculate total price for an item with options
 */
export function calculateItemPrice(
  item: MenuItem,
  selectedOptions?: Record<string, string | string[]>
): number {
  let total = item.priceCents;
  
  if (selectedOptions && item.optionGroups) {
    for (const group of item.optionGroups) {
      const selected = selectedOptions[group.id];
      if (!selected) continue;
      
      const selectedIds = Array.isArray(selected) ? selected : [selected];
      for (const optionId of selectedIds) {
        const option = group.options.find((o) => o.id === optionId);
        if (option) {
          total += option.priceCents;
        }
      }
    }
  }
  
  return total;
}

/**
 * Format price from cents to display string
 */
export function formatPrice(priceCents: number, currency: string = 'AUD'): string {
  const dollars = priceCents / 100;
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
  }).format(dollars);
}

/**
 * Get menu summary for display
 */
export function getMenuSummary(menu: MenuConfig): string {
  if (!menu.enabled || menu.items.length === 0) {
    return 'No menu available';
  }
  
  const categoryNames = menu.categories
    .filter((c) => c.available)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((c) => c.name);
  
  return `Menu categories: ${categoryNames.join(', ')}`;
}

/**
 * Get items in a category
 */
export function getItemsByCategory(menu: MenuConfig, categoryId: string): MenuItem[] {
  return menu.items
    .filter((item) => item.categoryId === categoryId && item.available)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}
