import React, { useEffect, useState } from 'react';
import { DataGrid } from 'react-data-grid';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { parse, unparse } from 'papaparse';

// Define types for parse data
interface ParsedRow {
    [key: string]: string | number | null;
}

// Define types for parse result
interface ParseResult {
    data: unknown[];
    meta?: {
        fields?: string[];
    };
}

interface EditorProps {
    content: string;
    onSaveContent: (text: string) => void;
    className?: string;
}

// Define interface for row data with id
interface RowWithId extends ParsedRow {
    id: number;
}

// Define Column interface
interface Column {
    key: string;
    name: string;
    resizable: boolean;
    editable: boolean;
}

export default function SheetEditor({ content, onSaveContent, className }: EditorProps) {
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [originalContent, setOriginalContent] = useState(content);

    useEffect(() => {
        if (content !== originalContent) {
            processContent(content);
            setOriginalContent(content);
        }
    }, [content, originalContent]);

    // Process the CSV content into rows and columns
    const processContent = (csvContent: string) => {
        // Parse CSV
        const result = parse(csvContent, { header: true }) as ParseResult;

        // Convert from list of objects format to array format
        const paddedData = result.data.map((row) => {
            // Clone the row to avoid modifying the original
            return { ...(row as ParsedRow) };
        });

        // Get headers from first row
        let allHeaders: string[] = [];
        if (result.meta && result.meta.fields) {
            allHeaders = result.meta.fields;
        } else if (result.data.length > 0) {
            const firstRow = result.data[0];
            if (firstRow && typeof firstRow === 'object' && firstRow !== null) {
                allHeaders = Object.keys(firstRow as object);
            }
        }

        setHeaders(allHeaders);
        setRows(paddedData as ParsedRow[]);
    };

    const handleCellChange = (rowIndex: number, columnKey: string, newValue: string) => {
        const updatedRows = [...rows];
        updatedRows[rowIndex] = {
            ...updatedRows[rowIndex],
            [columnKey]: newValue,
        };
        setRows(updatedRows);

        // Serialize back to CSV
        const csv = unparse(updatedRows);
        onSaveContent(csv);
    };

    // Setup columns for the grid
    const columns: Column[] = headers.map((header) => ({
        key: header,
        name: header,
        resizable: true,
        editable: true,
    }));

    // Setup rows with ID
    const rowsWithId: RowWithId[] = rows.map((row: ParsedRow, rowIndex: number) => {
        return { id: rowIndex, ...row };
    });

    return (
        <div className={cn("w-full h-full flex flex-col", className)}>
            <div className="overflow-auto flex-grow border rounded-md">
                <DataGrid
                    columns={columns}
                    rows={rowsWithId}
                    className="rdg-light h-full"
                    style={{ height: '100%' }}
                    onRowsChange={(newRows: RowWithId[]) => {
                        const updatedRows = newRows.map(({ id, ...rest }) => rest);
                        setRows(updatedRows);
                        const csv = unparse(updatedRows);
                        onSaveContent(csv);
                    }}
                />
            </div>
            <div className="mt-4 flex justify-end">
                <Button variant="default" onClick={() => {
                    const csv = unparse(rows);
                    onSaveContent(csv);
                }}>
                    Update
                </Button>
            </div>
        </div>
    );
} 