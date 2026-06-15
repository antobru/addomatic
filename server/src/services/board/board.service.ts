export type Project = { id: string; name: string; description: string };
export type CreateProject = Omit<Project, "id">;

export type ProjectPage = {
    id: string;
    name: string;
    access: 'public' | 'private' | string;
    description: string;
    external_id?: string;
    external_source?: string;
    created_at: Date;
    updated_at: Date;
    created_by?: string;
    deleted_at?: Date;
    updated_by?: string;
}
export type CreateProjectPage = Omit<ProjectPage, "id" | "created_at" | "updated_at">;

export interface IProjectBoardService {
    create(project: CreateProject): Promise<Project>;
}

export interface IPagesService {
    create(projectId: string, page: CreateProjectPage): Promise<ProjectPage>;
}

export interface IBoardService {
    projects: IProjectBoardService;
    pages: IPagesService;
}