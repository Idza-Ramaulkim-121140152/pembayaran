import React from 'react';
import MobileRowCard from './MobileRowCard';

function resolveValue(row, key) {
    if (!key) {
        return null;
    }

    return String(key)
        .split('.')
        .reduce((acc, current) => (acc == null ? undefined : acc[current]), row);
}

export function ResponsiveDataView({
    rows = [],
    columns = [],
    keyField = 'id',
    actions = null,
    priorityFields = [],
    emptyMessage = 'Data belum tersedia.',
    desktopWrapperClassName = 'overflow-x-auto',
    tableClassName = 'w-full text-sm',
    cardContainerClassName = 'mobile-stack md:hidden',
    rowClassName = null,
}) {
    const keyForRow = (row, index) => resolveValue(row, keyField) ?? `${index}-${JSON.stringify(row)}`;

    return (
        <>
            <div className={cardContainerClassName}>
                {rows.length === 0 ? (
                    <div className="mobile-section text-sm text-slate-500 text-center">{emptyMessage}</div>
                ) : (
                    rows.map((row, index) => (
                        <MobileRowCard
                            key={keyForRow(row, index)}
                            row={row}
                            columns={columns}
                            actions={actions}
                            priorityFields={priorityFields}
                        />
                    ))
                )}
            </div>

            <div className={`hidden md:block ${desktopWrapperClassName}`}>
                <table className={tableClassName}>
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            {columns.map((column) => (
                                <th key={column.key || column.label} className={column.headerClassName || 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider'}>
                                    {column.label}
                                </th>
                            ))}
                            {actions ? (
                                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Aksi</th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (actions ? 1 : 0)} className="px-4 py-8 text-center text-gray-500">
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr
                                    key={keyForRow(row, index)}
                                    className={`${typeof rowClassName === 'function' ? (rowClassName(row, index) || '') : (rowClassName || '')} hover:bg-gray-50 transition-colors`}
                                >
                                    {columns.map((column) => {
                                        const content = typeof column.render === 'function'
                                            ? column.render(row, index)
                                            : resolveValue(row, column.key) ?? '-';
                                        return (
                                            <td key={column.key || `${column.label}-${index}`} className={column.cellClassName || 'px-4 py-3 text-sm text-gray-800'}>
                                                {content}
                                            </td>
                                        );
                                    })}
                                    {actions ? (
                                        <td className="px-4 py-3 text-sm text-gray-800">{actions(row, index)}</td>
                                    ) : null}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </>
    );
}

export default ResponsiveDataView;
