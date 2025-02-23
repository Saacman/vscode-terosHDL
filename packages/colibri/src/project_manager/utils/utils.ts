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

import { t_project_definition } from "../project_definition";
import { convert_to_yaml } from "./json2yaml";
import * as file_utils from "../../utils/file_utils";
import * as general from "../../common/general";
// import { Database } from 'sqlite3';

// const fs = require('fs');
// const initSqlJs = require('sql-wasm.js');
// const initSqlJs = require('/home/carlos/Desktop/fs/sql-wasm.js');
const initSqlJs = require('sql.js');

export function get_edam_json(prj: t_project_definition, top_level_list: undefined | string[],
    refrence_path?: string) {

    // Set tool options in EDAM format
    const tool_name = prj.config.tools.general.select_tool;
    const tool_config = (<any>prj.config.tools)[tool_name];
    const tool_options = {
        name: tool_name,
        installation_path: tool_config['installation_path'],
        config: tool_config
    };

    const tmp_edam_0 = `{ "${tool_name}" : ${JSON.stringify(tool_options)} }`;
    const tmp_edam_1 = JSON.parse(tmp_edam_0);

    if (top_level_list === undefined) {
        top_level_list = prj.toplevel_path_manager.get(refrence_path);
    }

    let top_level = "";
    if (top_level_list.length > 0) {
        top_level = top_level_list[0];
    }

    const edam_json = {
        name: prj.name,
        project_disk_path: prj.project_disk_path,
        project_type: prj.project_type,
        toplevel: top_level,
        files: prj.file_manager.get(refrence_path),
        hooks: prj.hook_manager.get(),
        watchers: prj.watcher_manager.get(refrence_path),
        configuration: prj.config,
        tool_options: tmp_edam_1
    };

    return edam_json;
}

export function get_edam_yaml(prj: t_project_definition, top_level_list: undefined | string[],
    reference_path?: string) {
    const edam_json = get_edam_json(prj, top_level_list, reference_path);
    const edam_yaml = convert_to_yaml(edam_json);
    return edam_yaml;
}

/**
 * Get the file type for projec manager in string format
 * @param filepath File path. E.g: /home/user/file.vhd
 * @returns File type in string format
**/
export function get_file_type(filepath: string): string {
    const extension = file_utils.get_file_extension(filepath);
    const language = file_utils.get_language_from_extension(extension);
    if (language === general.LANGUAGE.NONE) {
        return extension.substring(1).toLocaleUpperCase();
    }
    const default_version = file_utils.get_default_version_for_language(language);
    let file_type: string = language;
    if (default_version !== undefined) {
        file_type += `-${default_version}`;
    }
    return file_type;
}

/**
 * Open the database and return the object
 * @param bbddPath Path to the database
 * @returns Promise with the database object
 */
export async function openDatabase(bbddPath: string) {
    try {
        const fs = require('fs');
        const filebuffer = fs.readFileSync(bbddPath);
        const SQL = await initSqlJs();
        const db = new SQL.Database(filebuffer);
    
        return db;
    }
    catch (error) {
        return undefined;
    }
}

/**
 * Close the database
 * @param db Database object
 */
export async function closeDatabase(db: any) {
    db.close();
}

/**
 * Exec query in the database
 * @param db Database object
 * @param query Query to execute
 * @returns Promise with the result of the query
 */
export async function execQuery(db: any, query: string): Promise<any[]> {
    try {
        const result: any = db.exec(query);

        const tableKeys = result[0].columns;
        const tableValues = result[0].values;

        const rows = tableValues.map((fila: any) => {
            const objeto: any = {};
            tableKeys.forEach((key: any, index: any) => {
                objeto[key] = fila[index];
            });
            return objeto;
        });
        return rows;
    } catch (error) {
        return [];
    }
}