import { injectable } from 'inversify';

import { ILanguageServiceProvider } from "../../base/common/languages/languageService";
import { LanguageProfile, MemoizedQuery } from "../base/LanguageProfile";

@injectable()
export class GolangProfile implements LanguageProfile {
	languageIds = ['Go'];
	fileExtensions = ['go'];
	grammar = (langService: ILanguageServiceProvider) => langService.getLanguage('go');
	isTestFile = (filePath: string) => filePath.endsWith('_test.go');
	hoverableQuery = new MemoizedQuery(`
     [(identifier)
       (type_identifier)
       (package_identifier)
       (field_identifier)] @hoverable
    `);
	classQuery = new MemoizedQuery(`
	    (type_declaration
			  (type_spec
			    name: (_) @type-name
			    type: (struct_type
			      (field_declaration_list
			        (field_declaration
			           name: (_)? @field-name
			           type: (_)? @field-type
			        )
			      )
			    )
			   )
			  )
    `);
	methodQuery = new MemoizedQuery(`
      (
				(function_declaration
			    name: (identifier) @function-name)
		    @function-body
	    )

		  (
		    (method_declaration
          receiver: (_)? @receiver-struct-name
          name: (_)? @method-name)
        @method-body
      )

    `);
	blockCommentQuery = new MemoizedQuery(`
		((comment)+) @docComment
	`);
	methodIOQuery = new MemoizedQuery(`
		(function_declaration
      name: (identifier) @method-name
      result: (
          (slice_type (qualified_type)  @method-returnType))?
    )
	`);
	symbolExtractor = new MemoizedQuery(`
(
  ((comment)* @comment)
  . (type_declaration (type_spec name: (_) @name type: (struct_type (field_declaration_list) @body))) @definition.struct
)
(
  ((comment)* @comment)
  . (type_declaration (type_spec name: (_) @name type: (interface_type (_)) @body)) @definition.interface
)
(
  ((comment)* @comment)
  . (method_declaration receiver: (parameter_list (parameter_declaration type: [(type_identifier) @receiver (pointer_type (type_identifier) @receiver)] )) name: (_) @name body: (_) @body) @definition.function
)
(
  ((comment)* @comment)
  . (function_declaration name: (_) @name) @definition.function
)
(
  ((comment)* @comment)
  . (field_declaration name: (_) @name) @definition.field
)
	`);
	structureQuery = new MemoizedQuery(`
			(package_clause
			  (package_identifier) @package-name)

			(import_declaration
			  (import_spec
			    path: (_) @import-name))

      (import_declaration
        (import_spec_list
	  		  (import_spec
				    path: (_) @import-name)))

			(
				(function_declaration
			    name: (identifier) @function-name)
		    @function-body
	    )

		  (
		    (method_declaration
          receiver: (_)? @receiver-struct-name
          name: (_)? @method-name)
        @method-body
      )

			(type_declaration
			  (type_spec
			    name: (_) @type-name
			    type: (struct_type
			      (field_declaration_list
			        (field_declaration
			           name: (_)? @field-name
			           type: (_)? @field-type
			        )
			      )
			    )
			   )
			  )
			`);
	namespaces = [
		// variables
		['const', 'var', 'func', 'module'],
		// types
		['struct', 'interface', 'type'],
		// devops.
		['member'],
		['label'],
	];
	autoSelectInsideParent = [];
	builtInTypes = [
		'bool',
		'byte',
		'complex64',
		'complex128',
		'error',
		'float32',
		'float64',
		'int',
		'int8',
		'int16',
		'int32',
		'int64',
		'rune',
		'string',
		'uint',
		'uint8',
		'uint16',
		'uint32',
		'uint64',
		'uintptr',
	];
}
