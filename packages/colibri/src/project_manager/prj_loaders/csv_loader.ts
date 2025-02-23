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

import * as file_utils from "../../utils/file_utils";
import { e_source_type, t_file } from "../common";
import { t_loader_file_list_result } from "../tool/common";

export function get_files_from_csv(csv_path: string, is_manual: boolean): t_loader_file_list_result {
    const csv_content = file_utils.read_file_sync(csv_path);
    const file_list_array = csv_content.split(/\r?\n|\r/);
    const result_file_list: t_file[] = [];
    for (let i = 0; i < file_list_array.length; ++i) {
        const element = file_list_array[i].trim();
        if (element !== '') {
            try {
                let proc_error = false;
                let lib_inst = "";
                let file_inst = "";
                const element_split = element.split(',');
                if (element_split.length === 1) {
                    file_inst = element.split(',')[0].trim();
                }
                else if (element_split.length === 2) {
                    lib_inst = element.split(',')[0].trim();
                    file_inst = element.split(',')[1].trim();
                }
                else {
                    proc_error = true;
                }

                if (proc_error === false) {
                    if (lib_inst === "") {
                        lib_inst = "";
                    }
                    const dirname_csv = file_utils.get_directory(csv_path);
                    const complete_file_path = file_utils.get_absolute_path(dirname_csv, file_inst);

                    const file_edam: t_file = {
                        name: complete_file_path,
                        is_include_file: false,
                        include_path: "",
                        logical_name: lib_inst,
                        is_manual: is_manual,
                        file_type: file_utils.get_language_from_filepath(complete_file_path),
                        file_version: file_utils.get_default_version_for_filepath(complete_file_path),
                        source_type: e_source_type.NONE,
                    };
                    result_file_list.push(file_edam);
                }
            }
            catch (e) {
                const result: t_loader_file_list_result = {
                    file_list: [],
                    successful: false,
                    msg: "Error processing CSV."
                };
                return result;
            }
        }
    }
    const result: t_loader_file_list_result = {
        file_list: result_file_list,
        successful: true,
        msg: ""
    };
    return result;
}