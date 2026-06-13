export class PlaneAPI {
  constructor(private readonly options: { baseURL: string; apiKey: string }) {}

  private get headers() {
    return {
      "Content-Type": "application/json",
      "X-API-Key": `plane_api_${this.options.apiKey}`,
    };
  }

  tasks = {
    create: async (task: { name: string; description?: string }) => {
      const response = await fetch(
        "https://api.plane.so/api/v1/workspaces/my-workspace/projects/project-uuid/work-items/",
        {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify({
            name: "Example Name",
            description: "Example description",
            priority: "medium",
            state: "550e8400-e29b-41d4-a716-446655440000",
            assignees: ["550e8400-e29b-41d4-a716-446655440000"],
            labels: ["550e8400-e29b-41d4-a716-446655440000"],
            external_id: "550e8400-e29b-41d4-a716-446655440000",
            external_source: "github",
          }),
        },
      );
      const data = await response.json();
    },
  };
}
