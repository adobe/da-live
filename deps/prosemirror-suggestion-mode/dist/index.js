// Vendored from prosemirror-suggestion-mode@1.0.79 (MIT, davefowler).
// Imports repointed at da-y-wrapper so the whole app shares one ProseMirror instance.
import {
  PluginKey, Plugin, Transform, Mapping, DecorationSet, Decoration, MenuItem,
} from 'da-y-wrapper';

// For global state
const suggestionPluginKey = new PluginKey('suggestion-mode');
// For transaction-only hints - will temporarily override the global state
const suggestionTransactionKey = new PluginKey('suggestion-mode-transaction');

// remove those non-text nodes that are inside the group
// Helper to find all suggestion marks and their boundaries in a range
const findSuggestionsInRange = (state, from, to) => {
    const markRanges = new Map();
    state.doc.nodesBetween(from, to, (node, pos) => {
        node.marks.forEach((mark) => {
            if (mark.type.name === 'suggestion_insert' ||
                mark.type.name === 'suggestion_delete') {
                const range = markRanges.get(mark) || { from: pos, to: pos };
                range.from = Math.min(range.from, pos);
                range.to = Math.max(range.to, pos + node.nodeSize);
                markRanges.set(mark, range);
            }
        });
    });
    return Array.from(markRanges.entries()).map(([mark, range]) => ({
        mark,
        from: range.from,
        to: range.to,
    }));
};
// look for all suggestions in a range and accept or reject them
const processSuggestionsInRange = (acceptOrReject, from, to) => {
    return (state, dispatch) => {
        const suggestions = findSuggestionsInRange(state, from, to);
        if (!suggestions.length || !dispatch)
            return false;
        const tr = state.tr;
        tr.setMeta(suggestionTransactionKey, { skipSuggestionOperation: true });
        // Process all marks in the range
        suggestions.forEach(({ mark, from: originalFrom, to: originalTo }) => {
            // Adjust positions based on previous changes
            const adjustedFrom = tr.mapping
                ? tr.mapping.map(originalFrom)
                : originalFrom;
            const adjustedTo = tr.mapping ? tr.mapping.map(originalTo) : originalTo;
            // one mark range we delete, the other we just remove the mark
            const markToDelete = acceptOrReject === 'accept' ? 'suggestion_delete' : 'suggestion_insert';
            if (mark.type.name === markToDelete) {
                // Todo, check if this is the only content in a node around it.
                // if so delete that node
                // Remove both text and mark
                tr.delete(adjustedFrom, adjustedTo);
            }
            else {
                // Keep the text, remove the mark
                tr.removeMark(adjustedFrom, adjustedTo, mark.type);
            }
        });
        dispatch(tr);
        return true;
    };
};
const acceptSuggestionsInRange = (from, to) => {
    return processSuggestionsInRange('accept', from, to);
};
const rejectSuggestionsInRange = (from, to) => {
    return processSuggestionsInRange('reject', from, to);
};
// For accepting/rejecting all suggestions in the document
const acceptAllSuggestions = (state, dispatch) => {
    return acceptSuggestionsInRange(0, state.doc.content.size)(state, dispatch);
};
const rejectAllSuggestions = (state, dispatch) => {
    return rejectSuggestionsInRange(0, state.doc.content.size)(state, dispatch);
};

// Default components builders
const defaultComponents = {
    // Creates the info section showing who made the change and when
    createInfoComponent(attrs) {
        const infoText = document.createElement('div');
        // Create text node for the first part
        infoText.appendChild(document.createTextNode('edited by '));
        // Create username span
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username';
        usernameSpan.textContent = attrs.username;
        infoText.appendChild(usernameSpan);
        return { dom: infoText };
    },
    // Creates the buttons section with accept/reject
    createButtonsComponent(from, to, handler) {
        const buttonsDiv = document.createElement('div');
        buttonsDiv.className = 'suggestion-buttons';
        const acceptButton = document.createElement('button');
        acceptButton.className = 'suggestion-accept';
        acceptButton.textContent = 'Accept';
        acceptButton.addEventListener('click', (e) => {
            e.stopPropagation();
            handler.dispatch(acceptSuggestionsInRange(from, to));
        });
        const rejectButton = document.createElement('button');
        rejectButton.className = 'suggestion-reject';
        rejectButton.textContent = 'Reject';
        rejectButton.addEventListener('click', (e) => {
            e.stopPropagation();
            handler.dispatch(rejectSuggestionsInRange(from, to));
        });
        buttonsDiv.appendChild(acceptButton);
        buttonsDiv.appendChild(rejectButton);
        return { dom: buttonsDiv };
    },
};
// Create a hover menu with the specified components
function hoverMenuFactory(options = {}) {
    const menuClass = options.menuClass || 'suggestion-hover-menu';
    const components = Object.assign(Object.assign({}, defaultComponents), options === null || options === void 0 ? void 0 : options.components);
    return (from, to, attrs, handler) => {
        // Create the menu container
        const menu = document.createElement('div');
        menu.className = menuClass;
        // Create and add the info component
        const infoComponent = components.createInfoComponent(attrs);
        menu.appendChild(infoComponent.dom);
        // Create and add the buttons component
        const buttonsComponent = components.createButtonsComponent(from, to, handler);
        menu.appendChild(buttonsComponent.dom);
        return menu;
    };
}

/**
 * Decorates a group of suggestions with a hover menu
 * @param decos - The array of decorations to add to
 * @param from - The start position of the group
 * @param to - The end position of the group
 * @param attrs - The attributes of the group
 * @param renderHoverMenu - The function to render the hover menu
 */
function decorateSuggestionGroup(decos, from, to, attrs, renderHoverMenu) {
    decos.push(Decoration.inline(from, to, {
        class: 'suggestion-group',
        key: `suggestion-group-${from}`,
    }));
    decos.push(Decoration.widget(from, (view) => {
        const wrapper = document.createElement('span');
        wrapper.className = 'suggestion-menu-wrapper';
        wrapper.id = `suggestion-menu-wrapper-${from}`;
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';
        wrapper.style.verticalAlign = 'text-top';
        wrapper.style.height = '0';
        wrapper.style.width = '0';
        wrapper.style.overflow = 'visible';
        const menu = renderHoverMenu(from, to, attrs, {
            dispatch: (command) => command(view.state, view.dispatch),
        });
        wrapper.appendChild(menu);
        return wrapper;
    }, {
        key: `hover-${from}`,
        side: -1,
    }));
}
/**
 * Creates a decoration set for a given editor state
 * @param state - The editor state to create decorations for
 * @param renderHoverMenu - The function to render the hover menu
 * @returns A decoration set for the editor state
 */
function createDecorations(state, renderHoverMenu) {
    const decos = [];
    let groupStart = null;
    let groupEnd = null;
    let currentUsername = null;
    let currentAttrs = null;
    // Helper function to create decoration and reset group tracking
    const finalizeCurrentGroup = () => {
        if (groupStart !== null) {
            decorateSuggestionGroup(decos, groupStart, groupEnd, currentAttrs, renderHoverMenu);
            groupStart = null;
            groupEnd = null;
            currentUsername = null;
            currentAttrs = null;
        }
    };
    state.doc.descendants((node, pos, parent, index) => {
        if (node.type.name !== 'text')
            return; // only look at text nodes
        const suggestionMark = node.marks.find((m) => m.type.name === 'suggestion_insert' ||
            m.type.name === 'suggestion_delete');
        if (!suggestionMark && !groupStart)
            return;
        if ((suggestionMark && currentUsername !== suggestionMark.attrs.username) ||
            !suggestionMark) {
            finalizeCurrentGroup();
        }
        if (suggestionMark) {
            if (!groupStart) {
                groupStart = pos;
                currentUsername = suggestionMark.attrs.username;
                currentAttrs = suggestionMark.attrs;
            }
            groupEnd = pos + node.nodeSize;
        }
    });
    // finalize the last group if there is one
    finalizeCurrentGroup();
    return DecorationSet.create(state.doc, decos);
}

/**
 * Initialize hover listeners for all suggestions and menus in the editor
 * This should be called whenever decorations are updated
 */
function initSuggestionHoverListeners(view) {
    // Find all suggestion elements in the document
    const suggestionElements = view.dom.querySelectorAll('.suggestion-group');
    // Store references to functions so they can be removed later
    const listeners = new WeakMap();
    // Add listeners to suggestion elements
    suggestionElements.forEach((element) => {
        const el = element;
        const key = el.getAttribute('key');
        const from = key.replace('suggestion-group-', '');
        const menuWrapper = view.dom.querySelector(`#suggestion-menu-wrapper-${from}`);
        if (!menuWrapper)
            return;
        const menu = menuWrapper.querySelector('.suggestion-hover-menu');
        if (!menu)
            return;
        // Create functions with closure over the specific menu
        const mouseEnter = () => {
            menu.style.display = 'block';
        };
        const mouseLeave = (event) => {
            // Only hide if not moving to the menu
            if (!menuWrapper.contains(event.relatedTarget)) {
                menu.style.display = 'none';
            }
        };
        // Store for cleanup
        listeners.set(el, { mouseEnter, mouseLeave });
        // Attach listeners
        el.addEventListener('mouseenter', mouseEnter);
        el.addEventListener('mouseleave', mouseLeave);
    });
    // menu wrappers also need to stay open on hover
    const menuWrappers = view.dom.querySelectorAll('.suggestion-menu-wrapper');
    menuWrappers.forEach((wrapper) => {
        const el = wrapper;
        const menu = el.querySelector('.suggestion-hover-menu');
        if (!menu)
            return;
        const mouseEnter = () => {
            menu.style.display = 'block';
        };
        const mouseLeave = () => {
            menu.style.display = 'none';
        };
        // Store for cleanup
        listeners.set(el, { mouseEnter, mouseLeave });
        // Attach listeners
        el.addEventListener('mouseenter', mouseEnter);
        el.addEventListener('mouseleave', mouseLeave);
    });
    return listeners; // Return for cleanup purposes
}

/**
 * Finds a position that is not the very start of a block node by traversing up
 * until it finds a block-node where it is not the starting position
 *
 * Needed for putting removed text back in before a block node was applied
 *
 * @param $pos - A resolved position in the document
 * @returns The adjusted position after traversing up through container nodes
 */
const findNonStartingPos = ($pos) => {
    if ($pos.parentOffset !== 0) {
        return $pos.pos;
    }
    let depth = $pos.depth;
    let position = $pos.pos;
    while (depth > 0) {
        const node = $pos.node(depth);
        // If we're in a list item or similar container, keep going up
        if (node.type.name === 'list_item' ||
            node.type.name === 'bullet_list' ||
            node.type.name === 'ordered_list') {
            position = $pos.before(depth);
            depth--;
        }
        else {
            break;
        }
    }
    return position;
};

// Type guard functions for each step type
function isReplaceStep(step) {
    return 'slice' in step && !('gapFrom' in step);
}
function isReplaceAroundStep(step) {
    return 'slice' in step && 'gapFrom' in step && 'gapTo' in step;
}
// Create the suggestions plugin
const suggestionModePlugin = (options = {}) => {
    // If custom options but no renderer is provided, use default renderer with custom options
    const renderHoverMenu = options.hoverMenuRenderer ||
        hoverMenuFactory((options === null || options === void 0 ? void 0 : options.hoverMenuOptions) || {});
    return new Plugin({
        key: suggestionPluginKey,
        // After a transaction is applied we add our suggestion marks to it
        // This will not impact undo/redo as ProseMirror's history plugin
        // automatically combines related transactions that happen close together in time
        // this is chosen over wrapping dispatchTransaction because it will keep a clean set of steps
        // and be less likely to interfere with other plugins.
        appendTransaction(transactions, oldState, newState) {
            // handle when a selection is deleted
            const pluginState = this.getState(oldState);
            let tr = newState.tr;
            let changed = false;
            // For handling multiple transforming steps in this dispatch
            // we need to keep track of the intermediate doc inbetween each step
            // so we can get the correct slice
            // Mapping is not enough because if you for instance delete a range,
            // and then delete another range around that first range
            // you can't just get the second deleted slice with simple mapping
            let intermediateTr = new Transform(oldState.doc);
            let lastStep = null;
            // After transactions are applied, apply transactions needed for the suggestion marks
            transactions.forEach((transaction, trIndex) => {
                // If the transaction is part of undo/redo history, skip it
                if (transaction.getMeta('history$'))
                    return;
                // Get the meta for this transaction from transaction metadata, with global meta defaults
                // Transaction only meta gets global meta defaults
                const transactionMeta = transaction.getMeta(suggestionTransactionKey);
                const mergedData = Object.assign(Object.assign({}, pluginState.data), transactionMeta === null || transactionMeta === void 0 ? void 0 : transactionMeta.data);
                const meta = Object.assign(Object.assign(Object.assign({}, pluginState), transactionMeta), { data: mergedData });
                // If we're not in suggestion mode do nothing
                if (!meta.inSuggestionMode)
                    return;
                // if this is a transaction that we created in this plugin, ignore it
                if (meta && meta.skipSuggestionOperation)
                    return;
                const username = meta.username;
                // Process each step in the transaction
                // This works for all 4 types of steps: ReplaceStep, AddMarkStep, RemoveMarkStep, ReplaceAroundStep
                transaction.steps.forEach((step, stepIndex) => {
                    var _a;
                    // update intermediateState if there was a previous step
                    if (lastStep)
                        intermediateTr.step(lastStep);
                    lastStep = step;
                    // Each transaction has two optional parts:
                    //   1. removedSlice - content that should be marked as suggestion_delete
                    //   2. addedSlice - content that should be marked as suggestion_insert
                    const removedSlice = intermediateTr.doc.slice(step.from, step.to, false);
                    // we don't actually use/need the addedSlice, we just need its size to mark it
                    // in all but the ReplaceStep, the removedSlice is the same size as the addedSlice
                    let addedSliceSize = isReplaceStep(step)
                        ? step.slice.size
                        : removedSlice.size;
                    let extraInsertChars = 0;
                    if (isReplaceAroundStep(step)) {
                        addedSliceSize = step.gapTo - step.gapFrom + step.slice.size;
                    }
                    // Mark our next transactions as an internal suggestion operation so it won't be intercepted again
                    tr.setMeta(suggestionTransactionKey, {
                        skipSuggestionOperation: true,
                    });
                    // Check if we're inside an existing suggestion mark
                    const $pos = intermediateTr.doc.resolve(step.from);
                    const marksAtPos = $pos.marks();
                    const existingSuggestionMark = marksAtPos.find((m) => m.type.name === 'suggestion_insert' ||
                        m.type.name === 'suggestion_delete');
                    let from = step.from;
                    if (existingSuggestionMark) {
                        if (addedSliceSize > 1) {
                            // a paste has happened in the middle of a suggestion mark
                            // make sure it has the same mark as the surrounding text
                            tr.addMark(from, from + addedSliceSize, existingSuggestionMark);
                            changed = true;
                        }
                        // We are already inside a suggestion mark so we don't need to do anything
                        return;
                    }
                    if (removedSlice.size > 0) {
                        // DELETE - content was removed.
                        // We need to put it back and add a suggestion_delete mark on it
                        const isBackspace = (isReplaceStep(step) || isReplaceAroundStep(step)) &&
                            step.slice.size === 0 &&
                            newState.selection.from === step.from;
                        // first map its position to the new doc
                        // grab all the unprocessed steps left in the transaction into a mapping
                        const mapToNewDocPos = transactions
                            .slice(trIndex)
                            .reduce((acc, tr, i) => {
                            const startStep = i === 0 ? stepIndex : 0;
                            tr.steps.slice(startStep).forEach((s) => {
                                acc.appendMap(s.getMap());
                            });
                            return acc;
                        }, new Mapping());
                        // map to the new doc position
                        from = mapToNewDocPos.map(step.from);
                        // then map to what we've done in suggestion transactions so far
                        from = tr.mapping.map(from);
                        const $from = tr.doc.resolve(from);
                        from = findNonStartingPos($from);
                        if (removedSlice.openEnd + removedSlice.openStart > 0) {
                            let currentPos = 0;
                            const pilcrowPositions = [];
                            removedSlice.content.forEach((node, offset, index) => {
                                if (index >=
                                    removedSlice.content.childCount - removedSlice.openEnd)
                                    // Don't add pilcrows for open ended nodes
                                    return;
                                // If it's a block node, add its end position
                                if (node.isBlock) {
                                    pilcrowPositions.push(currentPos + node.nodeSize - 2); // -2 to get inside the closing tag
                                }
                                currentPos += node.nodeSize;
                            });
                            // First insert the slice normally
                            tr.replace(from, from, removedSlice);
                            // Then insert pilcrows at the end of each block
                            let extraChars = 0;
                            pilcrowPositions.forEach((pos) => {
                                tr.insertText('¶', from + pos + extraChars);
                                extraChars += 1;
                            });
                            const endsWithText = ((_a = removedSlice.content.lastChild) === null || _a === void 0 ? void 0 : _a.textContent.length) > 0;
                            if (removedSlice.openEnd > 0 && !endsWithText) {
                                // if the last open node is empty, add a zero width space to be marked
                                tr.insertText('\u200B', from + currentPos + extraChars);
                                extraChars += 1;
                            }
                            // Add mark with expanded size to cover the pilcrows
                            tr.addMark(from, from + removedSlice.size + extraChars, newState.schema.marks.suggestion_delete.create({
                                username,
                                data: meta.data,
                            }));
                        }
                        else {
                            // Normal case without block boundaries
                            tr.replace(from, from, removedSlice);
                            tr.addMark(from, from + removedSlice.size, newState.schema.marks.suggestion_delete.create({
                                username,
                                data: meta.data,
                            }));
                        }
                        if (isBackspace) {
                            // place the cursor at the front if there was a backspace
                            tr.setSelection(tr.selection.constructor.create(tr.doc, from));
                        }
                        changed = true;
                    }
                    if (addedSliceSize > 0) {
                        // ReplaceAroundStep has an insert property that is the number of extra characters inserted
                        // for things like numbers in a list item
                        const addedFrom = from + removedSlice.size;
                        const addedTo = addedFrom + addedSliceSize + extraInsertChars;
                        // just mark it, it was already inserted before appendTransaction
                        tr.addMark(addedFrom, addedTo, newState.schema.marks.suggestion_insert.create({
                            username,
                            data: meta.data,
                        }));
                        changed = true;
                    }
                });
            });
            // Return the transaction if there were changes; otherwise return null
            return changed ? tr : null;
        },
        state: {
            init() {
                return {
                    inSuggestionMode: options.inSuggestionMode || false,
                    username: options.username || 'Anonymous',
                    data: options.data || {},
                };
            },
            apply(tr, value) {
                // If there's global metadata associated with this transaction, merge it into the current state
                const meta = tr.getMeta(suggestionPluginKey);
                const data = Object.assign(Object.assign({}, value.data), meta === null || meta === void 0 ? void 0 : meta.data);
                if (meta) {
                    return Object.assign(Object.assign(Object.assign({}, value), meta), { data });
                }
                // Otherwise, return the existing state as-is
                return value;
            },
        },
        props: {
            decorations(state) {
                var _a;
                if ((_a = options.hoverMenuOptions) === null || _a === void 0 ? void 0 : _a.disabled)
                    return null;
                return createDecorations(state, renderHoverMenu);
            },
        },
        view(view) {
            var _a;
            if ((_a = options.hoverMenuOptions) === null || _a === void 0 ? void 0 : _a.disabled)
                return null;
            // Initialize listeners when the view is created
            setTimeout(() => {
                initSuggestionHoverListeners(view);
            }, 0);
            return {
                update(view, prevState) {
                    // Re-initialize listeners when the decorations might have changed
                    if (view.state.doc !== prevState.doc) {
                        setTimeout(() => {
                            initSuggestionHoverListeners(view);
                        }, 0);
                    }
                },
                destroy() {
                },
            };
        },
    });
};

/**
 * Set the suggestion mode state
 * @param enabled Whether suggestion mode should be enabled or disabled
 */
const setSuggestionModeCommand = (enabled) => {
    return (state, dispatch) => {
        const pluginState = suggestionPluginKey.getState(state);
        if (!pluginState)
            return false;
        if (dispatch) {
            dispatch(state.tr.setMeta(suggestionPluginKey, Object.assign(Object.assign({}, pluginState), { inSuggestionMode: enabled })));
        }
        return true;
    };
};
/**
 * Toggle the suggestion mode on or off
 */
const toggleSuggestionMode = (state, dispatch) => {
    const pluginState = suggestionPluginKey.getState(state);
    if (!pluginState)
        return false;
    // Use setSuggestionModeCommand to toggle the current state
    return setSuggestionModeCommand(!pluginState.inSuggestionMode)(state, dispatch);
};
/**
 * Helper function to set suggestion mode (non-command version for direct view manipulation)
 */
const setSuggestionMode = (view, enabled) => {
    const command = setSuggestionModeCommand(enabled);
    return command(view.state, view.dispatch);
};

const applySuggestionToRange = (view, dispatch, from, to, suggestion, username) => {
    var _a;
    const newData = {};
    if (((_a = suggestion.reason) === null || _a === void 0 ? void 0 : _a.length) > 0)
        newData.reason = suggestion.reason;
    const tr = view.state.tr.setMeta(suggestionTransactionKey, {
        inSuggestionMode: true,
        data: newData,
        username,
        skipSuggestionOperation: false,
    });
    tr.replaceWith(from, to, view.state.schema.text(suggestion.textReplacement));
    dispatch(tr);
    return true;
};
/**
 * Create a ProseMirror command to apply a single text-based suggestion
 * @param suggestion The suggested edit with context
 * @param username Name to attribute suggestion to
 * @returns A ProseMirror command
 *
 * See examples/suggestEdit/ for an example
 */
const createApplySuggestionCommand = ({ textToReplace, textReplacement = '', reason = '', textBefore = '', textAfter = '', }, username) => {
    return (state, dispatch, view) => {
        if (textToReplace === undefined) {
            console.warn('prosemirror-suggestion-mode: Type error - Undefined textToReplace');
            return false;
        }
        // Create the complete search pattern
        const searchText = textBefore + textToReplace + textAfter;
        if (searchText.length === 0) {
            // No text to match - can only apply to empty doc
            if (state.doc.textContent.trim().replace(/\u200B/g, '').length > 0) {
                return false;
            }
            if (!dispatch)
                return true; // In dry run mode, just return that we can apply this
            // We're adding text into an empty doc
            return applySuggestionToRange(view, dispatch, 0, 0, {
                textReplacement,
                reason}, username);
        }
        const pattern = escapeRegExp(searchText);
        const regex = new RegExp(pattern, 'g');
        // Find matches in the text content
        let match;
        let matches = [];
        let matchCount = 0;
        const MAX_MATCHES = 1000; // Safety limit to prevent infinite loops
        const docText = state.doc.textContent;
        while ((match = regex.exec(docText)) !== null) {
            // Prevent infinite loops on zero-length matches
            if (match.index === regex.lastIndex) {
                regex.lastIndex++;
            }
            // Safety check to prevent memory issues
            matchCount++;
            if (matchCount > MAX_MATCHES) {
                console.warn('Too many matches found, stopping to prevent memory issues');
                break;
            }
            // Store the match position and length
            matches.push({
                index: match.index,
                length: match[0].length,
            });
        }
        // In dry run mode, just return if we found matches
        if (!dispatch)
            return matches.length === 1;
        // If there is a dispatch, we need the view
        if (!view)
            return false;
        if (matches.length > 0) {
            // We ignore multiple matches on purpose. Only do the first if multiple
            if (matches.length > 1) {
                console.warn('Multiple matches found, only applying the first', matches);
            }
            const applyingMatch = matches[0];
            // Calculate the position of just the 'textToReplace' part in the text content
            const textMatchStart = applyingMatch.index + textBefore.length;
            const textMatchEnd = textMatchStart + textToReplace.length;
            // Find the actual document positions that correspond to these text positions
            const docRange = findDocumentRange(state.doc, textMatchStart, textMatchEnd);
            if (!dispatch)
                return true; // In dry run mode, just return that we can apply this
            return applySuggestionToRange(view, dispatch, docRange.from, docRange.to, {
                textReplacement,
                reason}, username);
        }
        return false;
    };
};
/**
 * Translates positions in the textContent to positions in the document
 */
function findDocumentRange(doc, textStart, textEnd) {
    // Check if this is a real ProseMirror document with nodesBetween method
    if (doc.nodesBetween && typeof doc.nodesBetween === 'function') {
        try {
            let currentTextPos = 0;
            let startPos = null;
            let endPos = null;
            // Walk through all text nodes in the document
            doc.nodesBetween(0, doc.content.size, (node, nodeStartPos) => {
                if (startPos !== null && endPos !== null)
                    return false; // Stop if we've found both positions
                if (node.isText) {
                    const nodeTextEndPos = currentTextPos + node.text.length;
                    // Check if this node contains the start position
                    if (startPos === null &&
                        textStart >= currentTextPos &&
                        textStart <= nodeTextEndPos) {
                        const offsetInNode = textStart - currentTextPos;
                        startPos = nodeStartPos + offsetInNode;
                    }
                    // Check if this node contains the end position
                    if (endPos === null &&
                        textEnd >= currentTextPos &&
                        textEnd <= nodeTextEndPos) {
                        const offsetInNode = textEnd - currentTextPos;
                        endPos = nodeStartPos + offsetInNode;
                    }
                    currentTextPos = nodeTextEndPos;
                }
                return true; // Continue traversal
            });
            // If we found both positions, return them
            if (startPos !== null && endPos !== null) {
                return { from: startPos, to: endPos };
            }
        }
        catch (e) {
            // If there's an error in the nodesBetween approach, fall back to simple positions
            console.warn('Error in nodesBetween, falling back to simple positions:', e);
        }
    }
    // Fall back to simple positions for tests or if the traversal failed
    return { from: textStart, to: textEnd };
}
/**
 * Helper to escape special characters in a string for use in a regex
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Simplified helper function to apply a single text suggestion to an editor
 * This operates on a single suggestion for predictable behavior
 *
 * @param view The editor view
 * @param suggestion A single suggested edit with context
 * @param username Name to attribute suggestion to
 * @param dryRun Whether to run in dry run mode (no dispatch) @default false
 * @returns Boolean indicating if suggestion was applied successfully
 */
const applySuggestion = (view, suggestion, username, dryRun = false) => {
    const command = createApplySuggestionCommand(suggestion, username);
    if (dryRun)
        return command(view.state);
    return command(view.state, view.dispatch, view);
};

/**
 * Menu bar components for suggestion mode.
 * NOTE: Using this module requires adding "prosemirror-menu" as a dependency
 * to your project.
 */
const hasSuggestions = (state) => {
    let found = false;
    state.doc.descendants((node) => {
        if (node.marks.some((mark) => mark.type.name === 'suggestion_insert') ||
            node.marks.some((mark) => mark.type.name === 'suggestion_delete')) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
};
const getSuggestionMenuItems = () => [
    new MenuItem({
        title: 'Toggle Suggestion Mode',
        label: '✏️ Suggestions',
        enable: () => true,
        active(state) {
            const pluginState = suggestionPluginKey.getState(state);
            return (pluginState === null || pluginState === void 0 ? void 0 : pluginState.inSuggestionMode) || false;
        },
        run: toggleSuggestionMode,
    }),
    new MenuItem({
        title: 'Accept All',
        label: '✅ All',
        enable: hasSuggestions,
        run: acceptAllSuggestions,
    }),
    new MenuItem({
        title: 'Reject All',
        label: '❌ All',
        enable: hasSuggestions,
        run: rejectAllSuggestions,
    }),
];

// Define suggestion marks
const suggestionMarks = {
    suggestion_insert: {
        attrs: {
            username: { default: 'Anonymous' },
            data: { default: null },
        },
        inclusive: false,
        excludes: 'suggestion_delete',
        spanning: true, // allow the add mark to span multiple nodes and more agressively merge
        eq: (a, b) => a.attrs.username === b.attrs.username, // merge if usernames are the same
        parseDOM: [{ tag: 'span[data-suggestion-add]' }],
        toDOM() {
            return [
                'span',
                {
                    'data-suggestion-add': 'true',
                    class: 'suggestion-add',
                },
                0,
            ];
        },
    },
    suggestion_delete: {
        attrs: {
            username: { default: 'Anonymous' },
            data: { default: null },
        },
        inclusive: false, // typing at the end of a delete should not add to the delete
        excludes: 'suggestion_insert',
        spanning: true, // allow the delete mark to span multiple nodes and more agressively merge
        eq: (a, b) => a.attrs.username === b.attrs.username, // merge if usernames are the same
        parseDOM: [{ tag: 'span[data-suggestion-delete]' }],
        toDOM(node) {
            return [
                'span',
                {
                    'data-suggestion-delete': 'true',
                    class: 'suggestion-delete',
                },
                0,
            ];
        },
    },
};
// Helper function to add suggestion marks to an existing schema
const addSuggestionMarks = (marks) => {
    // Create a new object to store our marks
    const result = {};
    // If marks has a forEach method (like OrderedMap), use it to build our object
    if (typeof marks.forEach === 'function') {
        marks.forEach((key, value) => {
            result[key] = value;
        });
    }
    else {
        // Otherwise, assume it can be treated as a regular object
        Object.assign(result, marks);
    }
    // Add our suggestion marks
    result.suggestion_insert = suggestionMarks.suggestion_insert;
    result.suggestion_delete = suggestionMarks.suggestion_delete;
    return result;
};
// Here's how to add the marks to your schema
// import { schema } from "prosemirror-schema-basic";
// import { addListNodes } from "prosemirror-schema-list";
// export const exampleSchema = new Schema({
//   nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
//   marks: addSuggestionMarks(schema.spec.marks),
// });

export { acceptAllSuggestions, acceptSuggestionsInRange, addSuggestionMarks, applySuggestion, createApplySuggestionCommand, defaultComponents, getSuggestionMenuItems, hoverMenuFactory, rejectAllSuggestions, rejectSuggestionsInRange, setSuggestionMode, setSuggestionModeCommand, suggestionMarks, suggestionModePlugin, suggestionPluginKey, suggestionTransactionKey, toggleSuggestionMode };
