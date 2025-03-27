import React from 'react';
import { Column } from '@tanstack/react-table'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Create stubs for Radix icons as React components
const ArrowUpIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.5 1.5L7.5 13.5M7.5 1.5L3.5 5.5M7.5 1.5L11.5 5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowDownIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7.5 13.5L7.5 1.5M7.5 13.5L3.5 9.5M7.5 13.5L11.5 9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const EyeNoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M13.3536 13.3536C13.5488 13.1583 13.5488 12.8417 13.3536 12.6464L10.6464 9.93934C11.4309 9.40209 12.1422 8.73168 12.7135 8C12.9113 7.74892 13 7.62046 13 7.5C13 7.37954 12.9113 7.25108 12.7135 7C11.2061 5.14277 9.20278 4 7 4C6.2726 4 5.5626 4.12222 4.89636 4.3558L1.64645 1.10589C1.45118 0.910621 1.13458 0.910621 0.939309 1.10589C0.744042 1.30115 0.744042 1.61775 0.939309 1.81302L3.64634 4.51996C2.86219 5.05737 2.15794 5.72648 1.58647 6.46721C1.35472 6.76029 1.35472 7.23971 1.58647 7.53279C2.15794 8.27352 2.86219 8.94263 3.64634 9.48004L2.64645 10.4799C2.45118 10.6752 2.45118 10.9918 2.64645 11.1871C2.84171 11.3823 3.15829 11.3823 3.35355 11.1871L4.3536 10.187L13.3536 13.3536ZM5.06298 5.52246L9.47746 9.93694C8.87726 10.2676 8.19201 10.45 7.5 10.45C5.26147 10.45 3.45 8.63853 3.45 6.4C3.45 6.00347 3.51917 5.62853 3.64634 5.28352C4.05387 5.45023 4.5436 5.54 5.06298 5.52246Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

// Add missing CaretSortIcon
const CaretSortIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4.93179 5.43179C4.75605 5.60753 4.75605 5.89245 4.93179 6.06819C5.10753 6.24392 5.39245 6.24392 5.56819 6.06819L7.49999 4.13638L9.43179 6.06819C9.60753 6.24392 9.89245 6.24392 10.0682 6.06819C10.2439 5.89245 10.2439 5.60753 10.0682 5.43179L7.81819 3.18179C7.73379 3.0974 7.61933 3.04999 7.49999 3.04999C7.38064 3.04999 7.26618 3.0974 7.18179 3.18179L4.93179 5.43179ZM10.0682 9.56819C10.2439 9.39245 10.2439 9.10753 10.0682 8.93179C9.89245 8.75606 9.60753 8.75606 9.43179 8.93179L7.49999 10.8636L5.56819 8.93179C5.39245 8.75606 5.10753 8.75606 4.93179 8.93179C4.75605 9.10753 4.75605 9.39245 4.93179 9.56819L7.18179 11.8182C7.26618 11.9026 7.38064 11.95 7.49999 11.95C7.61933 11.95 7.73379 11.9026 7.81819 11.8182L10.0682 9.56819Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
  </svg>
);

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>
  title: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className='-ml-3 h-8 data-[state=open]:bg-accent'
          >
            <span>{title}</span>
            {column.getIsSorted() === 'desc' ? (
              <ArrowDownIcon className='ml-2 h-4 w-4' />
            ) : column.getIsSorted() === 'asc' ? (
              <ArrowUpIcon className='ml-2 h-4 w-4' />
            ) : (
              <CaretSortIcon className='ml-2 h-4 w-4' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem onClick={() => column.toggleSorting(false)}>
            <ArrowUpIcon className='mr-2 h-3.5 w-3.5 text-muted-foreground/70' />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => column.toggleSorting(true)}>
            <ArrowDownIcon className='mr-2 h-3.5 w-3.5 text-muted-foreground/70' />
            Desc
          </DropdownMenuItem>
          {column.getCanHide() && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
                <EyeNoneIcon className='mr-2 h-3.5 w-3.5 text-muted-foreground/70' />
                Hide
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
