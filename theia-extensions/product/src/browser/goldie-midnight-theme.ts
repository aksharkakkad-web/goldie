// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { MonacoThemeRegistry } from '@theia/monaco/lib/browser/textmate/monaco-theme-registry';

/** One native theme keeps the shell, Monaco editor and terminal in the same palette. */
@injectable()
export class GoldieMidnightTheme implements FrontendApplicationContribution {
    @inject(MonacoThemingService) protected readonly theming: MonacoThemingService;
    @inject(MonacoThemeRegistry) protected readonly registry: MonacoThemeRegistry;
    @inject(ThemeService) protected readonly themes: ThemeService;

    onDidInitializeLayout(): void {
        const base = this.registry.getThemeData('dark-theia');
        this.theming.registerParsedTheme({
            id: 'goldie-midnight', label: 'Goldie Midnight', uiTheme: 'vs-dark',
            description: 'Near-black workspace with quiet borders, based on the Goldie UI preview.',
            json: {
                tokenColors: base?.settings ?? [],
                colors: {
                    ...base?.colors,
                    'foreground': '#f1f2f4',
                    'descriptionForeground': '#8d919b',
                    'disabledForeground': '#5d616b',
                    'icon.foreground': '#8d919b',
                    'focusBorder': '#82a3ff',
                    'contrastBorder': '#00000000',
                    'editor.background': '#090a0c',
                    'editor.foreground': '#d9dce3',
                    'editor.lineHighlightBackground': '#101216',
                    'editor.lineHighlightBorder': '#00000000',
                    'editor.selectionBackground': '#33304d',
                    'editor.inactiveSelectionBackground': '#24262d',
                    'editorLineNumber.foreground': '#5d616b',
                    'editorLineNumber.activeForeground': '#b1b5bf',
                    'editorGutter.background': '#090a0c',
                    'editorGroup.border': '#24262d',
                    'editorGroupHeader.tabsBackground': '#0c0d10',
                    'editorGroupHeader.tabsBorder': '#24262d',
                    'editorGroupHeader.noTabsBackground': '#0c0d10',
                    'tab.activeBackground': '#090a0c',
                    'tab.inactiveBackground': '#0c0d10',
                    'tab.activeForeground': '#f1f2f4',
                    'tab.inactiveForeground': '#8d919b',
                    'tab.border': '#1a1c22',
                    'tab.activeBorder': '#b1b5bf',
                    'tab.activeBorderTop': '#00000000',
                    'sideBar.background': '#0c0d10',
                    'sideBar.foreground': '#b1b5bf',
                    'sideBar.border': '#24262d',
                    'sideBarTitle.foreground': '#8d919b',
                    'sideBarSectionHeader.background': '#0c0d10',
                    'sideBarSectionHeader.foreground': '#8d919b',
                    'sideBarSectionHeader.border': '#24262d',
                    'activityBar.background': '#0c0d10',
                    'activityBar.foreground': '#e1e3e9',
                    'activityBar.inactiveForeground': '#6c707b',
                    'activityBar.border': '#24262d',
                    'activityBar.activeBorder': '#b1b5bf',
                    'activityBarBadge.background': '#35304c',
                    'activityBarBadge.foreground': '#e8e1ff',
                    'panel.background': '#090a0c',
                    'panel.border': '#24262d',
                    'panelTitle.activeForeground': '#f1f2f4',
                    'panelTitle.inactiveForeground': '#8d919b',
                    'panelTitle.activeBorder': '#b1b5bf',
                    'titleBar.activeBackground': '#0e0f12',
                    'titleBar.inactiveBackground': '#0c0d10',
                    'titleBar.activeForeground': '#b1b5bf',
                    'titleBar.inactiveForeground': '#6c707b',
                    'titleBar.border': '#24262d',
                    'statusBar.background': '#0c0d10',
                    'statusBar.foreground': '#8d919b',
                    'statusBar.border': '#24262d',
                    'statusBar.noFolderBackground': '#0c0d10',
                    'statusBar.noFolderForeground': '#8d919b',
                    'statusBar.debuggingBackground': '#272030',
                    'statusBarItem.hoverBackground': '#17191e',
                    'statusBarItem.remoteBackground': '#26213a',
                    'statusBarItem.remoteForeground': '#c9b9f2',
                    'terminal.background': '#090a0c',
                    'terminal.foreground': '#d9dce3',
                    'terminal.selectionBackground': '#33304d',
                    'terminalCursor.foreground': '#d9dce3',
                    'input.background': '#111216',
                    'input.foreground': '#f1f2f4',
                    'input.border': '#24262d',
                    'input.placeholderForeground': '#6c707b',
                    'dropdown.background': '#111216',
                    'dropdown.foreground': '#d9dce3',
                    'dropdown.border': '#24262d',
                    'button.background': '#e1e3e9',
                    'button.foreground': '#090a0c',
                    'button.hoverBackground': '#ffffff',
                    'button.secondaryBackground': '#17191e',
                    'button.secondaryForeground': '#d9dce3',
                    'button.secondaryHoverBackground': '#22252c',
                    'list.hoverBackground': '#17191e',
                    'list.activeSelectionBackground': '#24232f',
                    'list.activeSelectionForeground': '#f1f2f4',
                    'list.inactiveSelectionBackground': '#1b1d23',
                    'list.inactiveSelectionForeground': '#d9dce3',
                    'list.focusBackground': '#24232f',
                    'list.focusForeground': '#f1f2f4',
                    'list.focusOutline': '#82a3ff',
                    'quickInput.background': '#111216',
                    'quickInput.foreground': '#d9dce3',
                    'quickInputTitle.background': '#17191e',
                    'editorWidget.background': '#111216',
                    'editorWidget.border': '#24262d',
                    'menu.background': '#111216',
                    'menu.foreground': '#d9dce3',
                    'menu.border': '#24262d',
                    'menu.selectionBackground': '#24232f',
                    'menu.selectionForeground': '#f1f2f4',
                    'notifications.background': '#111216',
                    'notifications.foreground': '#d9dce3',
                    'notifications.border': '#24262d',
                    'breadcrumb.background': '#090a0c',
                    'breadcrumb.foreground': '#8d919b',
                    'breadcrumb.focusForeground': '#f1f2f4',
                    'scrollbarSlider.background': '#3b3f494d',
                    'scrollbarSlider.hoverBackground': '#55596666',
                    'scrollbarSlider.activeBackground': '#6c707b80',
                    'widget.shadow': '#00000066'
                }
            }
        });
        // Replace only the built-in default dark theme. Other selected themes remain selectable.
        this.themes.initialized.then(() => {
            if (this.themes.getCurrentTheme().id === 'dark') {
                this.themes.setCurrentTheme('goldie-midnight', true);
            }
        });
    }
}
