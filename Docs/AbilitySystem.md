# Generic Ability System Documentation

## Overview

The new ability system in `guiHookUtils.js` provides a generic, extensible framework for implementing Pokemon card abilities without hard-coding each one into the core class.

## Key Benefits

1. **Extensible**: New abilities can be added without modifying core files
2. **Modular**: Each ability is self-contained with its own validation and execution logic
3. **Reusable**: Common components (target selectors, filters) can be shared between abilities
4. **Testable**: Each ability handler can be tested independently
5. **Maintainable**: Clear separation between ability logic and UI framework

## Architecture

### Core Components

1. **Ability Registry**: `Map` storing ability handlers
2. **Component Registry**: `Map` storing reusable UI components
3. **Generic Executor**: Framework for running any registered ability
4. **Validation System**: Consistent validation pattern for all abilities

### Ability Handler Structure

```javascript
{
    validator: async (gameState) => {
        // Return { valid: boolean, reason?: string }
    },
    executor: async (gameState, context) => {
        // Return { success: boolean, message?: string, error?: string }
    },
    components: {
        // Optional reusable components
        targetSelector: (targets) => { /* ... */ },
        cardFilter: (cards) => { /* ... */ }
    }
}
```

## How to Add New Abilities

### 1. Basic Ability Registration

```javascript
guiHookUtils.registerAbilityHandler('Ability Name', {
    validator: async (gameState) => {
        // Check if ability can be used
        if (/* some condition */) {
            return { valid: false, reason: 'Cannot use ability' };
        }
        return { valid: true };
    },
    
    executor: async (gameState, context) => {
        // Execute the ability
        try {
            // Your ability logic here
            return { success: true, message: 'Ability used successfully' };
        } catch (error) {
            return { success: false, error: 'Ability failed' };
        }
    }
});
```

### 2. Ability with Components

```javascript
guiHookUtils.registerAbilityHandler('Complex Ability', {
    validator: async (gameState) => {
        // Validation logic
        return { valid: true };
    },
    
    executor: async (gameState, context) => {
        // Use components from context
        const targets = context.components.cardFilter(gameState.yourState.bench);
        const selected = await context.components.targetSelector(targets);
        
        if (!selected) {
            return { success: false, error: 'No target selected' };
        }
        
        // Execute ability on selected target
        return { success: true, message: `Ability used on ${selected.name}` };
    },
    
    components: {
        cardFilter: (cards) => cards.filter(card => card !== null),
        targetSelector: (targets) => guiHookUtils.selectCardFromPlayer(targets, {
            title: 'Select Target',
            subtitle: 'Choose a Pokemon:'
        })
    }
});
```

### 3. Server Integration

```javascript
guiHookUtils.registerAbilityHandler('Server Ability', {
    validator: async (gameState) => {
        return { valid: true };
    },
    
    executor: async (gameState, context) => {
        if (context.isMultiplayer && context.webSocketClient) {
            // Send to server
            context.webSocketClient.sendCardMove(/* parameters */);
            return { success: true, message: 'Sent to server' };
        } else {
            // Local execution
            // Modify gameState directly for local games
            return { success: true, message: 'Executed locally' };
        }
    }
});
```

## Context Object

The `context` object passed to executors contains:

- `gameState`: Current game state
- `components`: Registered components for this ability
- `webSocketClient`: WebSocket client for server communication
- `isMultiplayer`: Boolean indicating if in multiplayer mode

## Migration from Hard-coded Abilities

### Before (Hard-coded):
```javascript
// In guiHookUtils.js
async handleRainDanceClientSide() {
    // 50+ lines of hard-coded logic
}

getClientSideAbilityHandlers() {
    return {
        'Rain Dance': async () => await this.handleRainDanceClientSide()
    };
}
```

### After (Generic):
```javascript
// In separate file or card definition
registerAbilityHandler('Rain Dance', {
    validator: async (gameState) => { /* validation */ },
    executor: async (gameState, context) => { /* execution */ },
    components: { /* reusable components */ }
});
```

## Future Enhancements

1. **External Ability Files**: Load abilities from separate modules
2. **Ability Templates**: Common patterns for similar abilities
3. **Dynamic Loading**: Load abilities on demand
4. **Ability Dependencies**: Abilities that depend on other abilities
5. **Ability Metadata**: Categories, costs, restrictions

## Best Practices

1. **Keep Validators Simple**: Fast checks only, complex logic in executor
2. **Use Components**: Extract reusable UI patterns
3. **Handle Both Modes**: Support both multiplayer and local execution
4. **Clear Error Messages**: Provide helpful feedback to users
5. **Consistent Return Values**: Always return success/error objects

## Example Usage

```javascript
// Initialize the system
const guiHook = new GUIHookUtils(domElement, webSocketClient);

// Register custom abilities (can be in separate files)
registerNewCardAbilities(guiHook);

// Abilities are now available through the existing interface
// No changes needed to existing code!
```

This system maintains full backward compatibility while providing a clean path for expansion.