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
    headClassName = 'bg-gray-50 border-b border-gray-100',
    bodyClassName = 'divide-y divide-gray-100',
    emptyDesktopClassName = 'px-4 py-8 text-center text-gray-500',
    mobileCardClassName = '',
    mobileLabelClassName = '',
    mobileValueClassName = '',
    mobileEmptyClassName = '',
    mobileActionBarClassName = '',
    rowHoverClassName = 'hover:bg-gray-50',
    actionsHeaderClassName = 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider',
    actionsCellClassName = 'px-4 py-3 text-sm text-gray-800',
}) {
    const keyForRow = (row, index) => resolveValue(row, keyField) ?? `${index}-${JSON.stringify(row)}`;

    return (
        <>
            <div className={cardContainerClassName}>
                {rows.length === 0 ? (
                    <div className={`mobile-section text-center text-sm ${mobileEmptyClassName || 'text-slate-500'}`}>{emptyMessage}</div>
                ) : (
                    rows.map((row, index) => (
                        <MobileRowCard
                            key={keyForRow(row, index)}
                            row={row}
                            columns={columns}
                            actions={actions}
                            priorityFields={priorityFields}
                            cardClassName={mobileCardClassName}
                            labelClassName={mobileLabelClassName}
                            valueClassName={mobileValueClassName}
                            actionBarClassName={mobileActionBarClassName}
                        />
                    ))
                )}
            </div>

            <div className={`hidden md:block ${desktopWrapperClassName}`}>
                <table className={tableClassName}>
                    <thead className={headClassName}>
                        <tr>
                            {columns.map((column) => (
                                <th key={column.key || column.label} className={column.headerClassName || 'px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider'}>
                                    {column.label}
                                </th>
                            ))}
                            {actions ? (
                                <th className={actionsHeaderClassName}>Aksi</th>
                            ) : null}
                        </tr>
                    </thead>
                    <tbody className={bodyClassName}>
                        {rows.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + (actions ? 1 : 0)} className={emptyDesktopClassName}>
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            rows.map((row, index) => (
                                <tr
                                    key={keyForRow(row, index)}
                                    className={`${typeof rowClassName === 'function' ? (rowClassName(row, index) || '') : (rowClassName || '')} ${rowHoverClassName} transition-colors`}
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
                                        <td className={actionsCellClassName}>{actions(row, index)}</td>
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
