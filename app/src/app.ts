import { gql, GraphQLClient } from "graphql-request";
import express, { Request, Response } from "express";
import {
  GithubGraphQlPinnedRepositories,
  createGithubRepoResponse,
  respondWithError,
  GithubRepository,
} from "./app.model";
import { Buffer } from "buffer";
import axios from "axios";
import morgan from "morgan";
import moment from "moment";
import cors from 'cors';

const nodeArgs = require("minimist")(process.argv.slice(2));
const githubApi = "https://api.github.com";
const githubGraphql = "https://api.github.com/graphql";
const githubPersonalAccessToken = nodeArgs['github-api-pat'];

export function main() {
  const api = express();

  api.use(
    cors({
      origin: "*"
    }),
    morgan("[:date[web]] - [:method] :url [:status]")
  )

  const graphql = new GraphQLClient(githubGraphql, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${githubPersonalAccessToken}`,
    },
  });

  api.get("/", (_request: Request, response: Response) => {
    response.send("Hello, this is dog.");
  });

  api.get("/repos", async (_request: Request, respond: Response) => {
    try {
      const githubRepos = await axios.get(
        `${githubApi}/users/mattgoespro/repos`
      );
      const pinnedGithubRepos =
        await graphql.request<GithubGraphQlPinnedRepositories>(
          gql`
    {
      user(login: "mattgoespro") {
        pinnedItems(first: 6, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
            }
          }
        }
      }
    }
  `
        );

      // Remove extraneous fields from Github API response body.
      const repoData = (githubRepos.data as GithubRepository[]).map((data) => ({
        full_name: data.full_name,
        name: data.name,
        description: data.description,
        pinned: false,
        created_at: data.created_at,
        updated_at: data.updated_at,
        html_url: data.html_url,
      }));

      respond
        .status(200)
        .json(createGithubRepoResponse(repoData, pinnedGithubRepos));
    } catch (err) {
      respondWithError(err, "Failed to retrieve repositories.", respond, 500);
    }
  });

  api.get("/repos/:name/languages", (request: Request, respond: Response) => {
    axios
      .get(`${githubApi}/repos/mattgoespro/${request.params.name}/languages`)
      .then((languages: { data: any }) => {
        respond.status(200).json(languages.data);
      })
      .catch((err: any) => {
        console.log(err);
        respondWithError(
          err,
          `Unable to fetch languages for project '${request.params.name}'.`,
          respond
        );
      });
  });

  api.get("/repos/:name/readme", (request: Request, respond: Response) => {
    axios
      .get(
        `${githubApi}/repos/mattgoespro/${request.params.name}/contents/README.md`
      )
      .then((rsp: { data: { content: any }; status: number }) => {
        let payload = rsp.data.content;
        if (rsp.status === 404) {
          payload = "";
        } else if (rsp.status === 200 || rsp.status === 304) {
          payload = Buffer.from(payload, "base64").toString().trim();
        }
        respond.status(200).send(payload);
      })
      .catch((err: any) => {
        respondWithError(
          err,
          `Unable to fetch readme for project '${request.params.name}'.`,
          respond
        );
      });
  });

  api.listen(3000, () => {
    console.log(
      `[${moment().format("llll")}][INFO] API server started.`
    );
    console.log(
      `[${moment().format("llll")}][INFO] Listening on port 3000...`
    );
  });
}
