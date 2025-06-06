import Parser from 'web-tree-sitter';
import * as Path from "node:path";

function formatWasmFileName(template: string, languageId: string) {
	return template.replace('{language}', languageId);
}

export type TreeSitterLoaderOptions = {
	pathTemplate?: string;
	pathFactory?: (languageId: string) => string;
	readFile(path: string): Promise<Uint8Array>;
};

export class TreeSitterLoader {
	private _initPromise?: Promise<void>;

	private _parsersCache = new Map<string, Promise<Parser>>();

	constructor(private options: TreeSitterLoaderOptions) {}

	ready() {
		if (this._initPromise) {
			return this._initPromise;
		}

		this._initPromise = Parser.init();

		this._initPromise.catch(error => {
			// For error retries
			this._initPromise = undefined;
		});

		return this._initPromise;
	}

	async parse(languageId: string, input: string): Promise<Parser.Tree> {
		const parser = await this.getLanguageParser(languageId);

		const result = parser.parse(input);

		parser.delete();
		return result;
	}

	async getLanguageParser(languageId: string): Promise<Parser> {
		return this.createLanguageParser(languageId);
	}

	async getLanguage(languageId: string): Promise<Parser.Language> {
		const parser = await this.getLanguageParser(languageId);
		return parser?.getLanguage();
	}

	protected async createLanguageParser(languageId: string) {
		const cache = this._parsersCache;

		if (cache.has(languageId)) {
			return cache.get(languageId)!;
		}

		const parserPromise = this.ready().then(() => {
			return this.initLanguageParser(languageId);
		});

		cache.set(languageId, parserPromise);

		parserPromise.catch(() => {
			cache.delete(languageId);
		});

		return parserPromise;
	}

	protected async initLanguageParser(languageId: string) {
		const language = await this.loadLanguage(languageId);
		const parser = new Parser();
		parser.setLanguage(language);
		return parser;
	}

	protected loadLanguage(languageId: string) {
		return this.loadLanguageWasmFile(languageId).then(bits => Parser.Language.load(bits));
	}

	protected loadLanguageWasmFile(languageId: string) {
		const { pathTemplate, pathFactory, readFile } = this.options;

		if (typeof pathFactory === 'function') {
			return readFile(pathFactory(languageId));
		}

		if (languageId === 'csharp') {
			languageId = 'c_sharp';
		}

		const wasmPath = pathTemplate || (() => {
			const isDev = process.env.NODE_ENV === 'development';
			if (isDev) {
				return Path.resolve(process.cwd(), "..", "node_modules", "@unit-mesh", "treesitter-artifacts", "wasm", "tree-sitter-{language}.wasm");
			} else {
				// In production, look for modules relative to bin location in node_modules
				return Path.resolve(__dirname, "tree-sitter-wasms", "tree-sitter-{language}.wasm");
			}
		})();

		let path = formatWasmFileName(pathTemplate || wasmPath, languageId);
		return readFile(path);
	}

	dispose() {
		for (const promise of this._parsersCache.values()) {
			promise.then(c => c.delete());
		}

		this._parsersCache.clear();
	}
}
