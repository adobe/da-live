import { keymap } from 'prosemirror-keymap';
import { undo, redo, history } from 'prosemirror-history';
import { toggleMark, wrapIn, chainCommands, exitCode, setBlockType, joinUp, joinDown, lift, selectParentNode, baseKeymap } from 'prosemirror-commands';
import { NodeSelection, Plugin } from 'prosemirror-state';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { icons, MenuItem, wrapItem, blockTypeItem, Dropdown, DropdownSubmenu, joinUpItem, liftItem, selectParentNodeItem, undoItem, redoItem, menuBar } from 'prosemirror-menu';
import { wrapInList, splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import { undoInputRule, smartQuotes, ellipsis, emDash, wrappingInputRule, textblockTypeInputRule, inputRules } from 'prosemirror-inputrules';

const prefix = "ProseMirror-prompt";
function openPrompt(options) {
    let wrapper = document.body.appendChild(document.createElement("div"));
    wrapper.className = prefix;
    let mouseOutside = (e) => { if (!wrapper.contains(e.target))
        close(); };
    setTimeout(() => window.addEventListener("mousedown", mouseOutside), 50);
    let close = () => {
        window.removeEventListener("mousedown", mouseOutside);
        if (wrapper.parentNode)
            wrapper.parentNode.removeChild(wrapper);
    };
    let domFields = [];
    for (let name in options.fields)
        domFields.push(options.fields[name].render());
    let submitButton = document.createElement("button");
    submitButton.type = "submit";
    submitButton.className = prefix + "-submit";
    submitButton.textContent = "OK";
    let cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = prefix + "-cancel";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", close);
    let form = wrapper.appendChild(document.createElement("form"));
    if (options.title)
        form.appendChild(document.createElement("h5")).textContent = options.title;
    domFields.forEach(field => {
        form.appendChild(document.createElement("div")).appendChild(field);
    });
    let buttons = form.appendChild(document.createElement("div"));
    buttons.className = prefix + "-buttons";
    buttons.appendChild(submitButton);
    buttons.appendChild(document.createTextNode(" "));
    buttons.appendChild(cancelButton);
    let box = wrapper.getBoundingClientRect();
    wrapper.style.top = ((window.innerHeight - box.height) / 2) + "px";
    wrapper.style.left = ((window.innerWidth - box.width) / 2) + "px";
    let submit = () => {
        let params = getValues(options.fields, domFields);
        if (params) {
            close();
            options.callback(params);
        }
    };
    form.addEventListener("submit", e => {
        e.preventDefault();
        submit();
    });
    form.addEventListener("keydown", e => {
        if (e.keyCode == 27) {
            e.preventDefault();
            close();
        }
        else if (e.keyCode == 13 && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
            e.preventDefault();
            submit();
        }
        else if (e.keyCode == 9) {
            window.setTimeout(() => {
                if (!wrapper.contains(document.activeElement))
                    close();
            }, 500);
        }
    });
    let input = form.elements[0];
    if (input)
        input.focus();
}
function getValues(fields, domFields) {
    let result = Object.create(null), i = 0;
    for (let name in fields) {
        let field = fields[name], dom = domFields[i++];
        let value = field.read(dom), bad = field.validate(value);
        if (bad) {
            reportInvalid(dom, bad);
            return null;
        }
        result[name] = field.clean(value);
    }
    return result;
}
function reportInvalid(dom, message) {
    // FIXME this is awful and needs a lot more work
    let parent = dom.parentNode;
    let msg = parent.appendChild(document.createElement("div"));
    msg.style.left = (dom.offsetLeft + dom.offsetWidth + 2) + "px";
    msg.style.top = (dom.offsetTop - 5) + "px";
    msg.className = "ProseMirror-invalid";
    msg.textContent = message;
    setTimeout(() => parent.removeChild(msg), 1500);
}
/**
The type of field that `openPrompt` expects to be passed to it.
*/
class Field {
    /**
    Create a field with the given options. Options support by all
    field types are:
    */
    constructor(
    /**
    @internal
    */
    options) {
        this.options = options;
    }
    /**
    Read the field's value from its DOM node.
    */
    read(dom) { return dom.value; }
    /**
    A field-type-specific validation function.
    */
    validateType(value) { return null; }
    /**
    @internal
    */
    validate(value) {
        if (!value && this.options.required)
            return "Required field";
        return this.validateType(value) || (this.options.validate ? this.options.validate(value) : null);
    }
    clean(value) {
        return this.options.clean ? this.options.clean(value) : value;
    }
}
/**
A field class for single-line text fields.
*/
class TextField extends Field {
    render() {
        let input = document.createElement("input");
        input.type = "text";
        input.placeholder = this.options.label;
        input.value = this.options.value || "";
        input.autocomplete = "off";
        return input;
    }
}

// Helpers to create specific types of items
function canInsert(state, nodeType) {
    let $from = state.selection.$from;
    for (let d = $from.depth; d >= 0; d--) {
        let index = $from.index(d);
        if ($from.node(d).canReplaceWith(index, index, nodeType))
            return true;
    }
    return false;
}
function insertImageItem(nodeType) {
    return new MenuItem({
        title: "Insert image",
        label: "Image",
        enable(state) { return canInsert(state, nodeType); },
        run(state, _, view) {
            let { from, to } = state.selection, attrs = null;
            if (state.selection instanceof NodeSelection && state.selection.node.type == nodeType)
                attrs = state.selection.node.attrs;
            openPrompt({
                title: "Insert image",
                fields: {
                    src: new TextField({ label: "Location", required: true, value: attrs && attrs.src }),
                    title: new TextField({ label: "Title", value: attrs && attrs.title }),
                    alt: new TextField({ label: "Description",
                        value: attrs ? attrs.alt : state.doc.textBetween(from, to, " ") })
                },
                callback(attrs) {
                    view.dispatch(view.state.tr.replaceSelectionWith(nodeType.createAndFill(attrs)));
                    view.focus();
                }
            });
        }
    });
}
function cmdItem(cmd, options) {
    let passedOptions = {
        label: options.title,
        run: cmd
    };
    for (let prop in options)
        passedOptions[prop] = options[prop];
    if (!options.enable && !options.select)
        passedOptions[options.enable ? "enable" : "select"] = state => cmd(state);
    return new MenuItem(passedOptions);
}
function markActive(state, type) {
    let { from, $from, to, empty } = state.selection;
    if (empty)
        return !!type.isInSet(state.storedMarks || $from.marks());
    else
        return state.doc.rangeHasMark(from, to, type);
}
function markItem(markType, options) {
    let passedOptions = {
        active(state) { return markActive(state, markType); }
    };
    for (let prop in options)
        passedOptions[prop] = options[prop];
    return cmdItem(toggleMark(markType), passedOptions);
}
function linkItem(markType) {
    return new MenuItem({
        title: "Add or remove link",
        icon: icons.link,
        active(state) { return markActive(state, markType); },
        enable(state) { return !state.selection.empty; },
        run(state, dispatch, view) {
            if (markActive(state, markType)) {
                toggleMark(markType)(state, dispatch);
                return true;
            }
            openPrompt({
                title: "Create a link",
                fields: {
                    href: new TextField({
                        label: "Link target",
                        required: true
                    }),
                    title: new TextField({ label: "Title" })
                },
                callback(attrs) {
                    toggleMark(markType, attrs)(view.state, view.dispatch);
                    view.focus();
                }
            });
        }
    });
}
function wrapListItem(nodeType, options) {
    return cmdItem(wrapInList(nodeType, options.attrs), options);
}
/**
Given a schema, look for default mark and node types in it and
return an object with relevant menu items relating to those marks.
*/
function buildMenuItems(schema) {
    let r = {};
    let mark;
    if (mark = schema.marks.strong)
        r.toggleStrong = markItem(mark, { title: "Toggle strong style", icon: icons.strong });
    if (mark = schema.marks.em)
        r.toggleEm = markItem(mark, { title: "Toggle emphasis", icon: icons.em });
    if (mark = schema.marks.code)
        r.toggleCode = markItem(mark, { title: "Toggle code font", icon: icons.code });
    if (mark = schema.marks.link)
        r.toggleLink = linkItem(mark);
    let node;
    if (node = schema.nodes.image)
        r.insertImage = insertImageItem(node);
    if (node = schema.nodes.bullet_list)
        r.wrapBulletList = wrapListItem(node, {
            title: "Wrap in bullet list",
            icon: icons.bulletList
        });
    if (node = schema.nodes.ordered_list)
        r.wrapOrderedList = wrapListItem(node, {
            title: "Wrap in ordered list",
            icon: icons.orderedList
        });
    if (node = schema.nodes.blockquote)
        r.wrapBlockQuote = wrapItem(node, {
            title: "Wrap in block quote",
            icon: icons.blockquote
        });
    if (node = schema.nodes.paragraph)
        r.makeParagraph = blockTypeItem(node, {
            title: "Change to paragraph",
            label: "Plain"
        });
    if (node = schema.nodes.code_block)
        r.makeCodeBlock = blockTypeItem(node, {
            title: "Change to code block",
            label: "Code"
        });
    if (node = schema.nodes.heading)
        for (let i = 1; i <= 10; i++)
            r["makeHead" + i] = blockTypeItem(node, {
                title: "Change to heading " + i,
                label: "Level " + i,
                attrs: { level: i }
            });
    if (node = schema.nodes.horizontal_rule) {
        let hr = node;
        r.insertHorizontalRule = new MenuItem({
            title: "Insert horizontal rule",
            label: "Horizontal rule",
            enable(state) { return canInsert(state, hr); },
            run(state, dispatch) { dispatch(state.tr.replaceSelectionWith(hr.create())); }
        });
    }
    let cut = (arr) => arr.filter(x => x);
    r.insertMenu = new Dropdown(cut([r.insertImage, r.insertHorizontalRule]), { label: "Insert" });
    r.typeMenu = new Dropdown(cut([r.makeParagraph, r.makeCodeBlock, r.makeHead1 && new DropdownSubmenu(cut([
            r.makeHead1, r.makeHead2, r.makeHead3, r.makeHead4, r.makeHead5, r.makeHead6
        ]), { label: "Heading" })]), { label: "Type..." });
    r.inlineMenu = [cut([r.toggleStrong, r.toggleEm, r.toggleCode, r.toggleLink])];
    r.blockMenu = [cut([r.wrapBulletList, r.wrapOrderedList, r.wrapBlockQuote, joinUpItem,
            liftItem, selectParentNodeItem])];
    r.fullMenu = r.inlineMenu.concat([[r.insertMenu, r.typeMenu]], [[undoItem, redoItem]], r.blockMenu);
    return r;
}

const mac = typeof navigator != "undefined" ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : false;
/**
Inspect the given schema looking for marks and nodes from the
basic schema, and if found, add key bindings related to them.
This will add:

* **Mod-b** for toggling [strong](https://prosemirror.net/docs/ref/#schema-basic.StrongMark)
* **Mod-i** for toggling [emphasis](https://prosemirror.net/docs/ref/#schema-basic.EmMark)
* **Mod-`** for toggling [code font](https://prosemirror.net/docs/ref/#schema-basic.CodeMark)
* **Ctrl-Shift-0** for making the current textblock a paragraph
* **Ctrl-Shift-1** to **Ctrl-Shift-Digit6** for making the current
  textblock a heading of the corresponding level
* **Ctrl-Shift-Backslash** to make the current textblock a code block
* **Ctrl-Shift-8** to wrap the selection in an ordered list
* **Ctrl-Shift-9** to wrap the selection in a bullet list
* **Ctrl->** to wrap the selection in a block quote
* **Enter** to split a non-empty textblock in a list item while at
  the same time splitting the list item
* **Mod-Enter** to insert a hard break
* **Mod-_** to insert a horizontal rule
* **Backspace** to undo an input rule
* **Alt-ArrowUp** to `joinUp`
* **Alt-ArrowDown** to `joinDown`
* **Mod-BracketLeft** to `lift`
* **Escape** to `selectParentNode`

You can suppress or map these bindings by passing a `mapKeys`
argument, which maps key names (say `"Mod-B"` to either `false`, to
remove the binding, or a new key name string.
*/
function buildKeymap(schema, mapKeys) {
    let keys = {}, type;
    function bind(key, cmd) {
        if (mapKeys) {
            let mapped = mapKeys[key];
            if (mapped === false)
                return;
            if (mapped)
                key = mapped;
        }
        keys[key] = cmd;
    }
    bind("Mod-z", undo);
    bind("Shift-Mod-z", redo);
    bind("Backspace", undoInputRule);
    if (!mac)
        bind("Mod-y", redo);
    bind("Alt-ArrowUp", joinUp);
    bind("Alt-ArrowDown", joinDown);
    bind("Mod-BracketLeft", lift);
    bind("Escape", selectParentNode);
    if (type = schema.marks.strong) {
        bind("Mod-b", toggleMark(type));
        bind("Mod-B", toggleMark(type));
    }
    if (type = schema.marks.em) {
        bind("Mod-i", toggleMark(type));
        bind("Mod-I", toggleMark(type));
    }
    if (type = schema.marks.code)
        bind("Mod-`", toggleMark(type));
    if (type = schema.nodes.bullet_list)
        bind("Shift-Ctrl-8", wrapInList(type));
    if (type = schema.nodes.ordered_list)
        bind("Shift-Ctrl-9", wrapInList(type));
    if (type = schema.nodes.blockquote)
        bind("Ctrl->", wrapIn(type));
    if (type = schema.nodes.hard_break) {
        let br = type, cmd = chainCommands(exitCode, (state, dispatch) => {
            if (dispatch)
                dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView());
            return true;
        });
        bind("Mod-Enter", cmd);
        bind("Shift-Enter", cmd);
        if (mac)
            bind("Ctrl-Enter", cmd);
    }
    if (type = schema.nodes.list_item) {
        bind("Enter", splitListItem(type));
        bind("Mod-[", liftListItem(type));
        bind("Mod-]", sinkListItem(type));
    }
    if (type = schema.nodes.paragraph)
        bind("Shift-Ctrl-0", setBlockType(type));
    if (type = schema.nodes.code_block)
        bind("Shift-Ctrl-\\", setBlockType(type));
    if (type = schema.nodes.heading)
        for (let i = 1; i <= 6; i++)
            bind("Shift-Ctrl-" + i, setBlockType(type, { level: i }));
    if (type = schema.nodes.horizontal_rule) {
        let hr = type;
        bind("Mod-_", (state, dispatch) => {
            if (dispatch)
                dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView());
            return true;
        });
    }
    return keys;
}

/**
Given a blockquote node type, returns an input rule that turns `"> "`
at the start of a textblock into a blockquote.
*/
function blockQuoteRule(nodeType) {
    return wrappingInputRule(/^\s*>\s$/, nodeType);
}
/**
Given a list node type, returns an input rule that turns a number
followed by a dot at the start of a textblock into an ordered list.
*/
function orderedListRule(nodeType) {
    return wrappingInputRule(/^(\d+)\.\s$/, nodeType, match => ({ order: +match[1] }), (match, node) => node.childCount + node.attrs.order == +match[1]);
}
/**
Given a list node type, returns an input rule that turns a bullet
(dash, plush, or asterisk) at the start of a textblock into a
bullet list.
*/
function bulletListRule(nodeType) {
    return wrappingInputRule(/^\s*([-+*])\s$/, nodeType);
}
/**
Given a code block node type, returns an input rule that turns a
textblock starting with three backticks into a code block.
*/
function codeBlockRule(nodeType) {
    return textblockTypeInputRule(/^```$/, nodeType);
}
/**
Given a node type and a maximum level, creates an input rule that
turns up to that number of `#` characters followed by a space at
the start of a textblock into a heading whose level corresponds to
the number of `#` signs.
*/
function headingRule(nodeType, maxLevel) {
    return textblockTypeInputRule(new RegExp("^(#{1," + maxLevel + "})\\s$"), nodeType, match => ({ level: match[1].length }));
}
/**
A set of input rules for creating the basic block quotes, lists,
code blocks, and heading.
*/
function buildInputRules(schema) {
    let rules = smartQuotes.concat(ellipsis, emDash), type;
    if (type = schema.nodes.blockquote)
        rules.push(blockQuoteRule(type));
    if (type = schema.nodes.ordered_list)
        rules.push(orderedListRule(type));
    if (type = schema.nodes.bullet_list)
        rules.push(bulletListRule(type));
    if (type = schema.nodes.code_block)
        rules.push(codeBlockRule(type));
    if (type = schema.nodes.heading)
        rules.push(headingRule(type, 6));
    return inputRules({ rules });
}

/**
Create an array of plugins pre-configured for the given schema.
The resulting array will include the following plugins:

 * Input rules for smart quotes and creating the block types in the
   schema using markdown conventions (say `"> "` to create a
   blockquote)

 * A keymap that defines keys to create and manipulate the nodes in the
   schema

 * A keymap binding the default keys provided by the
   prosemirror-commands module

 * The undo history plugin

 * The drop cursor plugin

 * The gap cursor plugin

 * A custom plugin that adds a `menuContent` prop for the
   prosemirror-menu wrapper, and a CSS class that enables the
   additional styling defined in `style/style.css` in this package

Probably only useful for quickly setting up a passable
editor—you'll need more control over your settings in most
real-world situations.
*/
function exampleSetup(options) {
    let plugins = [
        buildInputRules(options.schema),
        keymap(buildKeymap(options.schema, options.mapKeys)),
        keymap(baseKeymap),
        dropCursor(),
        gapCursor()
    ];
    if (options.menuBar !== false)
        plugins.push(menuBar({ floating: options.floatingMenu !== false,
            content: options.menuContent || buildMenuItems(options.schema).fullMenu }));
    if (options.history !== false)
        plugins.push(history());
    return plugins.concat(new Plugin({
        props: {
            attributes: { class: "ProseMirror-example-setup-style" }
        }
    }));
}

export { buildInputRules, buildKeymap, buildMenuItems, exampleSetup };
