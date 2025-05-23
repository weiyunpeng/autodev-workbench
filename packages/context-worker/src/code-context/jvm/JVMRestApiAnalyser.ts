import Parser, { SyntaxNode } from 'web-tree-sitter';
import { RestApiAnalyser } from '../base/RestApiAnalyser';
import { LanguageProfile } from '../base/LanguageProfile';
import { CodeFunction, CodeStructure } from '../../codemodel/CodeElement';
import { LanguageIdentifier } from '../../base/common/languages/languages';
import { ILanguageServiceProvider } from '../../base/common/languages/languageService';
import { MemoizedQuery } from '../base/LanguageProfile';

export interface Annotation {
	name: string;
	keyValues: { key: string; value: string }[];
}

export abstract class JVMRestApiAnalyser extends RestApiAnalyser {
	protected parser: Parser | undefined;
	protected language: Parser.Language | undefined;
	protected abstract config: LanguageProfile;

	protected abstract springAnnotationQuery: MemoizedQuery;
	protected abstract restTemplateQuery: MemoizedQuery;

	abstract override readonly langId: LanguageIdentifier;

	async init(langService: ILanguageServiceProvider): Promise<void> {
		const parser = await langService.getParser(this.langId);
		const language = await this.config.grammar(langService, this.langId);
		parser!.setLanguage(language);
		this.parser = parser;
		this.language = language;
	}

	analyse(node: CodeStructure, workspacePath: string): void {
		if (!this.language || !this.parser) {
			console.warn(`${this.constructor.name} not initialized for ${this.langId}`);
			return;
		}

		// Step 1: Read the source code (we need to get it from somewhere)
		// This is a placeholder; in a real implementation, we would need to read the source code
		const sourceCode = ''; // Placeholder

		if (!sourceCode) {
			console.warn('No source code available for analysis');
			return;
		}

		// Step 2: Parse the code
		const tree = this.parser.parse(sourceCode);

		// Step 3: Check if this class is a Spring Controller
		const classAnnotations = this.extractAnnotations(tree.rootNode);
		const isController = this.isSpringController(classAnnotations);

		if (isController) {
			// Step 4: Get base URL from class-level RequestMapping
			const baseUrl = this.getBaseUrl(classAnnotations);

			// Step 5: Analyze methods
			if (node.methods && node.methods.length > 0) {
				node.methods.forEach(method => {
					// For each method, we need to get its node from the parse tree
					// This is simplified; in a real implementation, we would need to locate
					// the method in the AST
					const methodNode = this.findMethodNode(tree.rootNode, method.name);
					if (methodNode) {
						const methodAnnotations = this.extractAnnotations(methodNode);
						this.processControllerMethod(method, methodAnnotations, baseUrl, node);
					}
				});
			}
		}

		// Step 6: Check for RestTemplate usages
		this.findRestTemplateUsages(tree.rootNode, node);
	}

	protected extractAnnotations(node: SyntaxNode): Annotation[] {
		if (!this.language) return [];

		const annotations: Annotation[] = [];
		const query = this.springAnnotationQuery.query(this.language);
		if (!query) return [];

		const captures = query.captures(node);
		let currentAnnotation: Annotation | null = null;

		for (const capture of captures) {
			switch (capture.name) {
				case 'annotation-name':
					if (currentAnnotation) {
						annotations.push(currentAnnotation);
					}
					currentAnnotation = { name: capture.node.text, keyValues: [] };
					break;
				case 'key':
					if (!currentAnnotation) break;
					// Store the key for the next value
					currentAnnotation.keyValues.push({ key: capture.node.text, value: '' });
					break;
				case 'value':
					if (!currentAnnotation) break;

					// If we have a key waiting for a value, assign this value to it
					if (currentAnnotation.keyValues.length > 0 &&
						currentAnnotation.keyValues[currentAnnotation.keyValues.length - 1].value === '') {
						const lastKeyValue = currentAnnotation.keyValues[currentAnnotation.keyValues.length - 1];
						lastKeyValue.value = this.cleanStringLiteral(capture.node.text);
					} else {
						// No key specified, use an empty key (for single value annotations)
						currentAnnotation.keyValues.push({ key: '', value: this.cleanStringLiteral(capture.node.text) });
					}
					break;
			}
		}

		// Add the last annotation if there is one
		if (currentAnnotation) {
			annotations.push(currentAnnotation);
		}

		return annotations;
	}

	protected abstract cleanStringLiteral(text: string): string;

	protected isSpringController(annotations: Annotation[]): boolean {
		return annotations.some(anno =>
			anno.name === 'RestController' ||
			anno.name === 'Controller'
		);
	}

	protected getBaseUrl(annotations: Annotation[]): string {
		const requestMapping = annotations.find(anno => anno.name === 'RequestMapping');
		if (!requestMapping) return '';

		// Try to get the value directly if it's a single value annotation
		if (requestMapping.keyValues.length === 1 && requestMapping.keyValues[0].key === '') {
			return requestMapping.keyValues[0].value;
		}

		// Otherwise look for the 'value' key
		const valueKeyValue = requestMapping.keyValues.find(kv => kv.key === 'value');
		return valueKeyValue ? valueKeyValue.value : '';
	}

	protected findMethodNode(rootNode: SyntaxNode, methodName: string): SyntaxNode | null {
		// This is a simplified implementation
		// In a real implementation, we would traverse the AST to find the method node
		// For now, we'll just return null as a placeholder
		return null;
	}

	protected processControllerMethod(
		method: CodeFunction,
		annotations: Annotation[],
		baseUrl: string,
		node: CodeStructure
	): void {
		let httpMethod = '';
		let path = '';

		// Check for HTTP method annotations
		for (const annotation of annotations) {
			switch (annotation.name) {
				case 'GetMapping':
					httpMethod = 'GET';
					path = this.getPathFromAnnotation(annotation);
					break;
				case 'PostMapping':
					httpMethod = 'POST';
					path = this.getPathFromAnnotation(annotation);
					break;
				case 'DeleteMapping':
					httpMethod = 'DELETE';
					path = this.getPathFromAnnotation(annotation);
					break;
				case 'PutMapping':
					httpMethod = 'PUT';
					path = this.getPathFromAnnotation(annotation);
					break;
				case 'PatchMapping':
					httpMethod = 'PATCH';
					path = this.getPathFromAnnotation(annotation);
					break;
				case 'RequestMapping':
					path = this.getPathFromAnnotation(annotation);
					// For RequestMapping, we need to check the method attribute
					const methodAttr = annotation.keyValues.find(kv => kv.key === 'method');
					if (methodAttr) {
						if (methodAttr.value.includes('GET')) httpMethod = 'GET';
						else if (methodAttr.value.includes('POST')) httpMethod = 'POST';
						else if (methodAttr.value.includes('DELETE')) httpMethod = 'DELETE';
						else if (methodAttr.value.includes('PUT')) httpMethod = 'PUT';
						else if (methodAttr.value.includes('PATCH')) httpMethod = 'PATCH';
					}
					break;
			}

			// If we found an HTTP method and path, we can stop
			if (httpMethod && path) break;
		}

		// If we found an HTTP method, add it to our resources
		if (httpMethod) {
			const fullPath = this.combinePaths(baseUrl, path);

			this.resources.push({
				url: fullPath,
				httpMethod: httpMethod,
				packageName: node.package,
				className: node.name,
				methodName: method.name
			});
		}
	}

	protected getPathFromAnnotation(annotation: Annotation): string {
		// Try to get the value directly if it's a single value annotation
		if (annotation.keyValues.length === 1 && annotation.keyValues[0].key === '') {
			return annotation.keyValues[0].value;
		}

		// Otherwise look for the 'value' key
		const valueKeyValue = annotation.keyValues.find(kv => kv.key === 'value');
		return valueKeyValue ? valueKeyValue.value : '';
	}

	protected findRestTemplateUsages(rootNode: SyntaxNode, node: CodeStructure): void {
		if (!this.language) return;

		const query = this.restTemplateQuery.query(this.language);
		if (!query) return;

		const captures = query.captures(rootNode);
		let currentInvocation = {
			objectName: '',
			methodName: '',
			urlArg: ''
		};

		for (const capture of captures) {
			switch (capture.name) {
				case 'object-name':
					currentInvocation.objectName = capture.node.text;
					break;
				case 'method-name':
					currentInvocation.methodName = capture.node.text;
					break;
				case 'url-arg':
					currentInvocation.urlArg = this.cleanStringLiteral(capture.node.text);

					// If we have all parts of a RestTemplate invocation, record it
					if (currentInvocation.objectName === 'restTemplate' &&
						currentInvocation.methodName &&
						currentInvocation.urlArg) {

						// Determine HTTP method from method name
						let httpMethod = '';
						const methodName = currentInvocation.methodName.toLowerCase();
						if (methodName.startsWith('get')) httpMethod = 'GET';
						else if (methodName.startsWith('post')) httpMethod = 'POST';
						else if (methodName.startsWith('delete')) httpMethod = 'DELETE';
						else if (methodName.startsWith('put')) httpMethod = 'PUT';
						else if (methodName.startsWith('patch')) httpMethod = 'PATCH';

						if (httpMethod) {
							this.demands.push({
								sourceCaller: node.name,
								targetUrl: currentInvocation.urlArg,
								targetHttpMethod: httpMethod
							});
						}

						// Reset for next invocation
						currentInvocation = { objectName: '', methodName: '', urlArg: '' };
					}
					break;
			}
		}
	}

	protected combinePaths(basePath: string, subPath: string): string {
		if (!basePath && !subPath) return '/';

		if (!basePath) return subPath.startsWith('/') ? subPath : '/' + subPath;
		if (!subPath) return basePath.startsWith('/') ? basePath : '/' + basePath;

		const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
		const normalizedSub = subPath.startsWith('/') ? subPath : '/' + subPath;

		return normalizedBase + normalizedSub;
	}
}
