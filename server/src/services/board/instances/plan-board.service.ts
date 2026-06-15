import { Markdown } from "../../../utils/markdown.utils.js";
import { CreateProject, CreateProjectPage, IBoardService, IPagesService, IProjectBoardService, Project, ProjectPage } from "../board.service.js";
import { PlaneClient } from "@makeplane/plane-node-sdk";

export class PlaneBoardService implements IBoardService {
    projects: IProjectBoardService
    pages: IPagesService;
    private readonly planeClient: PlaneClient;

    constructor(config: {
        baseUrl?: string | undefined;
        apiKey?: string | undefined;
        accessToken?: string | undefined;
        enableLogging?: boolean | undefined;
    }) {
        this.planeClient = new PlaneClient(config);
        this.projects = new PlaneProjectBoardService(this.planeClient);
        this.pages = new PlanePagesService(this.planeClient);
    }
}

export class PlaneProjectBoardService implements IProjectBoardService {

    constructor(private readonly planeClient: PlaneClient) {
    }

    create(project: CreateProject): Promise<Project> {
        const createdProject = this.planeClient.projects.create('', {
            name: project.name,
            description: project.description,
        });
        return createdProject;
    }
}

export class PlanePagesService implements IPagesService {

    constructor(private readonly planeClient: PlaneClient) { }

    create(projectId: string, page: CreateProjectPage): Promise<ProjectPage> {
        const createdPage = this.planeClient.pages.createProjectPage(page.name, projectId, {
            access: page.access === 'public' ? 0 : 1,
            name: page.name,
            description: page.description,
            external_id: page.external_id,
            external_source: page.external_source,
            created_at: new Date(),
            updated_at: new Date(),
            created_by: page.created_by,
            description_html: Markdown.isHtml(page.description) ? page.description : Markdown.toHtml(page.description),
        });
        return createdPage as Promise<ProjectPage>;
    }
}