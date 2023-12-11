// Copyright 2023
// Carlos Alberto Ruiz Naranjo [carlosruiznaranjo@gmail.com]
// Ismael Perez Rojo [ismaelprojo@gmail.com]
//
// This file is part of TerosHDL
//
// Colibri is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Colibri is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with TerosHDL.  If not, see <https://www.gnu.org/licenses/>.

import * as vscode from "vscode";
import * as element from "./element";
import { t_Multi_project_manager } from '../../../type_declaration';
import * as events from "events";
import * as teroshdl2 from 'teroshdl2';
import { Logger, debugLogger } from "../../../logger";
import { RedTextDecorator } from "./element";
import { ChildProcess } from "child_process";
import * as shelljs from 'shelljs';
import { LogView } from "../../../views/logs";
import * as tree_kill from 'tree-kill';
import { BaseView } from "../baseView";
import { e_viewType } from "../common";
import { getFamilyDeviceFromQuartusProject } from "../utils";

enum e_VIEW_STATE {
    IDLE = 0,
    RUNNING = 1,
    FINISHED = 2,
    FAILED = 3
}

export class Tasks_manager extends BaseView {
    private tree: element.ProjectProvider;
    private project_manager: t_Multi_project_manager;
    private logger: Logger;
    private state: e_VIEW_STATE = e_VIEW_STATE.IDLE;
    private latesRunTask: ChildProcess | undefined = undefined;
    private latestTask: teroshdl2.project_manager.tool_common.e_taskType | undefined | string = undefined;
    private logView: LogView;
    private statusBar: vscode.StatusBarItem | undefined = undefined;

    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    // Constructor
    ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    constructor(context: vscode.ExtensionContext, manager: t_Multi_project_manager, logger: Logger, logView: LogView) {

        super(e_viewType.TASKS);

        this.set_commands();

        this.logger = logger;
        this.project_manager = manager;
        this.tree = new element.ProjectProvider(manager);
        this.logView = logView;

        const provider = new RedTextDecorator();
        context.subscriptions.push(vscode.window.registerFileDecorationProvider(provider));

        context.subscriptions.push(vscode.window.registerTreeDataProvider(element.ProjectProvider.getViewID(),
            this.tree as element.BaseTreeDataProvider<element.Task>));
    }

    /**
     * Sets up the commands for the task manager.
     */
    set_commands() {
        vscode.commands.registerCommand("teroshdl.view.tasks.report", (item) =>
            this.openReport(item, teroshdl2.project_manager.tool_common.e_reportType.REPORT));
        vscode.commands.registerCommand("teroshdl.view.tasks.timing_analyzer", (item) =>
            this.openReport(item, teroshdl2.project_manager.tool_common.e_reportType.TIMINGANALYZER));
        vscode.commands.registerCommand("teroshdl.view.tasks.technology_map_viewer", (item) =>
            this.openReport(item, teroshdl2.project_manager.tool_common.e_reportType.TECHNOLOGYMAPVIEWER));
        vscode.commands.registerCommand("teroshdl.view.tasks.snapshotviewer", (item) =>
            this.openReport(item, teroshdl2.project_manager.tool_common.e_reportType.SNAPSHOPVIEWER));
        vscode.commands.registerCommand("teroshdl.view.tasks.logs", (item) =>
            this.openReport(item, teroshdl2.project_manager.tool_common.e_reportType.REPORTDB));

        vscode.commands.registerCommand("teroshdl.view.tasks.stop", () => this.stop());
        vscode.commands.registerCommand("teroshdl.view.tasks.run", (item) => this.run(item));
        vscode.commands.registerCommand("teroshdl.view.tasks.clean", () => this.clean());
        vscode.commands.registerCommand("teroshdl.view.tasks.device", () => this.device());
    }

    /**
     * Stops the latest run task if it is still running.
     */
    stop() {
        if (this.latesRunTask && !this.latesRunTask.killed) {
            try {
                const pid = this.latesRunTask.pid;
                tree_kill(pid, 'SIGTERM', (err) => {
                    if (err) {
                        console.error(err);
                    } else {
                        this.logger.warn(`${this.latestTask} stopped.`);
                        vscode.window.showInformationMessage(`${this.latestTask} stopped successfully.`);
                    }
                });
            } catch (error) {
                console.log(error);
            }
        }
    }

    async run(taskItem: element.Task) {
        if (this.checkRunning()) {
            return;
        }

        this.state = e_VIEW_STATE.RUNNING;
        this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

        try {
            const selectedProject = this.project_manager.get_selected_project();

            // const taskStatus = selectedProject.getTaskState(taskItem.taskDefinition.name);
            // if (taskStatus === teroshdl2.project_manager.tool_common.e_taskState.FINISHED) {
            //     const msg = `${taskItem.taskDefinition.name} has already run successfully. Do you want to run the task again?`;
            //     const result = await vscode.window.showInformationMessage(
            //         msg,
            //         'Yes',
            //         'No'
            //     );

            //     if (result === 'No') {
            //         this.state = e_VIEW_STATE.IDLE;
            //         return;
            //     }
            // }

            const task = taskItem.taskDefinition.name;
            this.setStatusBarText(undefined);
            this.statusBar.show();

            const exec_i = selectedProject.runTask(task, (result: teroshdl2.process.common.p_result) => {
                this.hideStatusBar();
                this.state = e_VIEW_STATE.IDLE;
                // Refresh view to set the finish decorators
                this.refresh_tree();
            });
            this.latesRunTask = exec_i;
            this.latestTask = taskItem.taskDefinition.name;
            // Refresh view to set the running decorators
            this.refresh_tree();

            this.logger.show(true);
            if (exec_i.stdout) {
                exec_i.stdout.on('data', (data: string) => {
                    this.logger.log(data);
                });
            }

            if (exec_i.stderr) {
                exec_i.stderr.on('data', (data: string) => {
                    this.logger.log(data);
                });
            }
        }
        catch (error) {
            // Refresh view to set the finish decorators
            this.refresh_tree();
            this.hideStatusBar();
            this.state = e_VIEW_STATE.IDLE;
        }
    }

    async device() {
        const selectedProject = this.project_manager.get_selected_project();
        const config = selectedProject.get_config();
        const family = config.tools.quartus.family
        const device = config.tools.quartus.device;
        vscode.window.showInformationMessage(`Family: ${family}\nDevice: ${device}`);

        // const msg = `Family: ${family}\nDevice: ${device}\n. Do you want to change it?`;
        // const result = await vscode.window.showInformationMessage(
        //     msg,
        //     'Yes',
        //     'No'
        // );
        // if (result === 'No') {
        //     return;
        // }

        // const deviceFamily = await getFamilyDeviceFromQuartusProject(this.project_manager);
        // if (deviceFamily !== undefined) {
        //     config.tools.quartus.family = deviceFamily.family;
        //     config.tools.quartus.device = deviceFamily.device;
        //     selectedProject.set_config(config);
        // }
    }

    async clean() {
        if (this.checkRunning()) {
            return;
        }

        const msg = "Do you want to clean the project? Cleaning revisions removes the project database and other files generated by the Quartus Prime Software, including report and programming files.";
        const result = await vscode.window.showInformationMessage(
            msg,
            'Yes',
            'No'
        );

        if (result === 'Yes') {
            this.state = e_VIEW_STATE.RUNNING;

            this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
            this.setStatusBarText("Clean Project");
            this.statusBar.show();
            try {
                const selectedProject = this.project_manager.get_selected_project();
                const exec_i = selectedProject.cleallAllProject((result: teroshdl2.process.common.p_result) => {
                    this.hideStatusBar();
                    this.state = e_VIEW_STATE.IDLE;
                    // Refresh view to set the finish decorators
                    this.refresh_tree();
                });

                // Refresh view to set the running decorators
                this.refresh_tree();

                this.logger.show(true);
                if (exec_i.stdout) {
                    exec_i.stdout.on('data', (data: string) => {
                        this.logger.log(data);
                    });
                }

                if (exec_i.stderr) {
                    exec_i.stderr.on('data', (data: string) => {
                        this.logger.log(data);
                    });
                }
            }
            catch (error) { }
            finally {
                this.hideStatusBar();
                this.state = e_VIEW_STATE.IDLE;
                // Refresh view to set the finish decorators
                this.refresh_tree();
            }
        }
    }

    /**
     * Checks if there is a task currently running.
     * 
     * @returns {boolean} Returns true if there is a task running, otherwise false.
     */
    checkRunning() {
        if (this.state === e_VIEW_STATE.RUNNING) {
            vscode.window.showInformationMessage("There is a task running. Please wait until it finishes.");
            return true;
        }
        return false;
    }

    openReport(taskItem: element.Task, reportType: teroshdl2.project_manager.tool_common.e_reportType) {
        const selectedProject = this.project_manager.get_selected_project();
        const task = taskItem.taskDefinition.name;
        const report = selectedProject.getArtifact(task, reportType);
        if (reportType === teroshdl2.project_manager.tool_common.e_reportType.TECHNOLOGYMAPVIEWER) {
            vscode.window.showWarningMessage("Technology Map Viewer is not supported yet.");
            return;
        }
        else if (reportType === teroshdl2.project_manager.tool_common.e_reportType.SNAPSHOPVIEWER) {
            vscode.window.showWarningMessage("Snapshop Viewer is not supported yet.");
            return;
        }

        // const taskStatus = selectedProject.getTaskState(task);
        // if (taskStatus !== teroshdl2.project_manager.tool_common.e_taskState.FINISHED &&
        //     report.element_type !== teroshdl2.project_manager.tool_common.e_element_type.DATABASE) {
        //     showTaskWarningMessage(task);
        //     return;
        // }

        if (report.artifact_type === teroshdl2.project_manager.tool_common.e_artifact_type.COMMAND) {
            shelljs.exec(report.command, { async: true, cwd: report.path });
        }
        if (report.artifact_type === teroshdl2.project_manager.tool_common.e_artifact_type.SUMMARY
            && report.element_type === teroshdl2.project_manager.tool_common.e_element_type.TEXT_FILE) {
            if (!teroshdl2.utils.file.check_if_path_exist(report.path)) {
                debugLogger.show();
                debugLogger.warn(`The report ${report.path} does not exist.`);
                vscode.window.showWarningMessage("The report does not exist.");
                return;
            }
            vscode.window.showTextDocument(vscode.Uri.file(report.path));
        }
        if (report.artifact_type === teroshdl2.project_manager.tool_common.e_artifact_type.LOG
            && report.element_type === teroshdl2.project_manager.tool_common.e_element_type.DATABASE) {
            if (!teroshdl2.utils.file.check_if_path_exist(report.path)) {
                debugLogger.show();
                debugLogger.warn(`The report ${report.path} does not exist.`);
                vscode.window.showWarningMessage("The report database does not exist.");
                return;
            }
            this.logView.sendLogs(report.path);
        }
    }

    setStatusBarText(text: string | undefined) {
        if (this.statusBar !== undefined) {
            if (text === undefined) {
                this.statusBar.text = `$(sync~spin) Running Quartus task...`;
            }
            else {
                this.statusBar.text = `$(sync~spin) Running Quartus task: ${text}...`;
            }
        }
    }

    hideStatusBar() {
        if (this.statusBar !== undefined) {
            this.statusBar.hide();
        }
    }

    refresh_tree() {
        const selected_project = this.project_manager.get_selected_project();
        const currentTask = selected_project.getTaskStatus().currentTask;
        if (currentTask !== undefined && this.statusBar !== undefined) {
            this.setStatusBarText(currentTask);
        }
        this.tree.refresh();
    }
}

function showTaskWarningMessage(task: string) {
    vscode.window.showWarningMessage(`The task ${task} has not finished yet. Please wait until it finishes to open the report.`);
}
