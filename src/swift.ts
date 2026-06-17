import type { MimeSymbol, SymbolKind, TreeSitterNode } from "@plurnk/plurnk-mimetypes";

// Swift SPEC §3 mapping for tree-sitter-swift.
//
// tree-sitter-swift uses an umbrella `class_declaration` node for
// struct/class/enum/actor/extension. The discriminator is the first (unnamed)
// child whose type is the keyword: 'struct', 'class', 'enum', 'actor',
// 'extension'.
//
//   class_declaration (struct/class/actor) → class
//   class_declaration (enum)               → enum + enum_entry → constant
//   class_declaration (extension)          → class (extension on existing type)
//   protocol_declaration                   → interface
//   function_declaration                   → function (top-level) / method (in body)
//   init_declaration                       → method
//   deinit_declaration                     → method
//   subscript_declaration                  → method
//   property_declaration                   → field (in body) / variable/constant (top-level)
//   typealias_declaration                  → type
//   macro_declaration                      → function
//   protocol_function_declaration          → method (inside protocol_body)
//   protocol_property_declaration          → field (inside protocol_body)
//   associatedtype_declaration             → type (inside protocol_body)
export function extract(root: TreeSitterNode): MimeSymbol[] {
    const out: MimeSymbol[] = [];
    walk(root, out, /*inBody*/ false);
    return out;
}

function walk(node: TreeSitterNode, out: MimeSymbol[], inBody: boolean): void {
    for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (!child) continue;
        dispatch(child, out, inBody);
    }
}

function dispatch(node: TreeSitterNode, out: MimeSymbol[], inBody: boolean): void {
    switch (node.type) {
        case "class_declaration": {
            const keyword = firstUnnamedChildType(node);
            const name = childFieldText(node, "name");
            const body = node.childForFieldName("body");
            if (!name) return;
            if (keyword === "enum") {
                push(out, "enum", name, node);
                if (body) emitEnumBody(body, out);
                return;
            }
            // struct, class, actor, extension all surface as class — they are
            // structurally equivalent for the outline (they group methods +
            // fields under a named container).
            push(out, "class", name, node);
            if (body) walk(body, out, true);
            return;
        }
        case "protocol_declaration": {
            const name = childFieldText(node, "name");
            if (!name) return;
            push(out, "interface", name, node);
            const body = node.childForFieldName("body");
            if (body) walk(body, out, true);
            return;
        }
        case "function_declaration": {
            const name = childFieldText(node, "name");
            if (!name) return;
            out.push({
                name,
                kind: inBody ? "method" : "function",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                params: extractFunctionParams(node),
            });
            return;
        }
        case "init_declaration":
            out.push({
                name: "init",
                kind: "method",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                params: extractFunctionParams(node),
            });
            return;
        case "deinit_declaration":
            out.push({
                name: "deinit",
                kind: "method",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
            });
            return;
        case "subscript_declaration":
            out.push({
                name: "subscript",
                kind: "method",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                params: extractFunctionParams(node),
            });
            return;
        case "property_declaration": {
            const name = propertyName(node);
            if (!name) return;
            const isLet = hasFirstUnnamedKeyword(node, "let");
            const kind: SymbolKind = inBody
                ? "field"
                : (isLet || isScreamingSnake(name) ? "constant" : "variable");
            push(out, kind, name, node);
            return;
        }
        case "typealias_declaration": {
            const name = childFieldText(node, "name");
            if (name) push(out, "type", name, node);
            return;
        }
        case "macro_declaration": {
            const name = childFieldText(node, "name") ?? findMacroName(node);
            if (name) push(out, "function", name, node);
            return;
        }
        case "protocol_function_declaration": {
            const name = childFieldText(node, "name");
            if (name) {
                out.push({
                    name,
                    kind: "method",
                    line: node.startPosition.row + 1,
                    endLine: node.endPosition.row + 1,
                    params: extractFunctionParams(node),
                });
            }
            return;
        }
        case "protocol_property_declaration": {
            const name = propertyName(node);
            if (name) push(out, "field", name, node);
            return;
        }
        case "associatedtype_declaration": {
            const name = childFieldText(node, "name");
            if (name) push(out, "type", name, node);
            return;
        }
        default:
            return;
    }
}

function emitEnumBody(body: TreeSitterNode, out: MimeSymbol[]): void {
    for (let i = 0; i < body.namedChildCount; i += 1) {
        const child = body.namedChild(i);
        if (!child) continue;
        if (child.type === "enum_entry") {
            // enum_entry may carry multiple `name` fields (case a, b → two names).
            for (let j = 0; j < child.namedChildCount; j += 1) {
                const sub = child.namedChild(j);
                if (!sub) continue;
                if (sub.type === "simple_identifier") {
                    push(out, "constant", sub.text, child);
                }
            }
            continue;
        }
        // Non-case members of an enum body (methods, computed properties) —
        // dispatch as if inside a class body.
        dispatch(child, out, true);
    }
}

function firstUnnamedChildType(node: TreeSitterNode): string | null {
    for (let i = 0; i < node.childCount; i += 1) {
        const child = node.child(i);
        if (!child) continue;
        if (!isNamed(child)) return child.type;
    }
    return null;
}

function hasFirstUnnamedKeyword(node: TreeSitterNode, keyword: string): boolean {
    // value_binding_pattern (let/var) is typically the first child of
    // property_declaration; its first unnamed child is the keyword.
    const binding = findChildOfType(node, "value_binding_pattern");
    if (binding) {
        for (let i = 0; i < binding.childCount; i += 1) {
            const c = binding.child(i);
            if (c && !isNamed(c) && c.type === keyword) return true;
        }
    }
    // Fallback: scan the property declaration's own unnamed children.
    for (let i = 0; i < node.childCount; i += 1) {
        const c = node.child(i);
        if (c && !isNamed(c) && c.type === keyword) return true;
    }
    return false;
}

function propertyName(node: TreeSitterNode): string | null {
    // tree-sitter-swift wraps the name in a `pattern → bound_identifier`
    // structure. Walk the `name` field down to the inner simple_identifier.
    const pat = node.childForFieldName("name");
    if (!pat) return null;
    return deepFirst(pat, "simple_identifier") ?? deepFirst(pat, "bound_identifier") ?? pat.text;
}

function extractFunctionParams(node: TreeSitterNode): string[] {
    const out: string[] = [];
    for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (!child) continue;
        if (child.type === "parameter") {
            // parameter has multiple `name` fields — first is the external
            // label, second is the internal name. We surface internal names
            // (matching the conventional readable form).
            const names: string[] = [];
            for (let j = 0; j < child.namedChildCount; j += 1) {
                const sub = child.namedChild(j);
                if (sub && sub.type === "simple_identifier") names.push(sub.text);
            }
            if (names.length > 0) out.push(names[names.length - 1]);
        }
    }
    return out;
}

function findMacroName(node: TreeSitterNode): string | null {
    // macro_declaration's name shows up as a deep simple_identifier within
    // the children — walk to find the first one.
    return deepFirst(node, "simple_identifier");
}

function childFieldText(node: TreeSitterNode, field: string): string | null {
    const child = node.childForFieldName(field);
    if (!child) return null;
    // Sometimes the field returns a wrapper; drill to inner identifier.
    if (child.type === "simple_identifier" || child.type === "type_identifier") {
        return child.text;
    }
    return deepFirst(child, "simple_identifier")
        ?? deepFirst(child, "type_identifier")
        ?? child.text;
}

function findChildOfType(node: TreeSitterNode, type: string): TreeSitterNode | null {
    for (let i = 0; i < node.namedChildCount; i += 1) {
        const child = node.namedChild(i);
        if (child && child.type === type) return child;
    }
    return null;
}

function deepFirst(node: TreeSitterNode, type: string): string | null {
    const stack: TreeSitterNode[] = [node];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        if (cur.type === type) return cur.text;
        for (let i = cur.namedChildCount - 1; i >= 0; i -= 1) {
            const child = cur.namedChild(i);
            if (child) stack.push(child);
        }
    }
    return null;
}

function isNamed(node: TreeSitterNode): boolean {
    // web-tree-sitter exposes isNamed as a getter on the node; the framework's
    // shared TreeSitterNode type doesn't include it, so duck-typed access.
    return (node as unknown as { isNamed?: boolean }).isNamed === true;
}

function isScreamingSnake(name: string): boolean {
    if (name.length < 2) return false;
    let hasLetter = false;
    for (const c of name) {
        if (c >= "A" && c <= "Z") hasLetter = true;
        else if (c === "_" || (c >= "0" && c <= "9")) continue;
        else return false;
    }
    return hasLetter;
}

function push(out: MimeSymbol[], kind: SymbolKind, name: string, node: TreeSitterNode): void {
    out.push({
        name,
        kind,
        line: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
    });
}

// References query for tree-sitter-swift (SPEC §16). Swift doesn't
// syntactically distinguish a function call from an initializer, so (like
// Python) `Helper()` classifies as `call`. Imports are module names (like Go) —
// no bound symbol to join — so they are not emitted.
//
//   inheritance_specifier → inherit (class/struct : Super, protocol conformance)
//   call_expression       → call (free calls + initializers; member calls via
//                           the navigation suffix's trailing identifier)
//   type_annotation       → type (property/parameter user types)
export const refsQuery = `
(inheritance_specifier (user_type (type_identifier) @ref.inherit))

(call_expression (simple_identifier) @ref.call)
(call_expression (navigation_expression (navigation_suffix (simple_identifier) @ref.call)))

(type_annotation (user_type (type_identifier) @ref.type))
(parameter (user_type (type_identifier) @ref.type))
`;
