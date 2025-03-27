declare module 'papaparse' {
    interface ParseConfig {
        delimiter?: string;
        newline?: string;
        quoteChar?: string;
        escapeChar?: string;
        header?: boolean;
        transformHeader?: (header: string) => string;
        dynamicTyping?: boolean;
        preview?: number;
        encoding?: string;
        worker?: boolean;
        comments?: string | boolean;
        download?: boolean;
        skipEmptyLines?: boolean | 'greedy';
        fastMode?: boolean;
        withCredentials?: boolean;
        step?: (results: ParseResult, parser: any) => void;
        complete?: (results: ParseResult, file: any) => void;
        error?: (error: Error, file: any) => void;
        chunk?: (results: ParseResult, parser: any) => void;
        beforeFirstChunk?: (chunk: string) => string | void;
        transform?: (value: string, field: string | number) => any;
        delimitersToGuess?: string[];
    }

    interface UnparseConfig {
        quotes?: boolean | boolean[] | ((value: any) => boolean);
        quoteChar?: string;
        escapeChar?: string;
        delimiter?: string;
        header?: boolean;
        newline?: string;
        skipEmptyLines?: boolean;
        columns?: string[] | ((fields: any) => string[]);
    }

    interface ParseResult {
        data: any[];
        errors: any[];
        meta: {
            delimiter: string;
            linebreak: string;
            aborted: boolean;
            truncated: boolean;
            cursor: number;
            fields?: string[];
        };
    }

    export function parse(input: string, config?: ParseConfig): ParseResult;
    export function unparse(data: any, config?: UnparseConfig): string;
} 