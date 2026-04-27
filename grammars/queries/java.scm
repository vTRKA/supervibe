; Java symbol + edge queries.

(method_declaration
  name: (identifier) @name) @symbol.method

(class_declaration
  name: (identifier) @name) @symbol.class

(interface_declaration
  name: (identifier) @name) @symbol.interface

(enum_declaration
  name: (identifier) @name) @symbol.enum

; Calls
(method_invocation
  name: (identifier) @target) @edge.calls

; Imports
(import_declaration
  (scoped_identifier) @target) @edge.imports

; Inheritance
(superclass
  (type_identifier) @target) @edge.extends

(super_interfaces
  (type_list
    (type_identifier) @target)) @edge.implements
