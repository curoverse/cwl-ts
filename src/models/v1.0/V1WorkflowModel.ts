import {WorkflowModel} from "../generic/WorkflowModel";
import {V1StepModel} from "./V1StepModel";
import {V1WorkflowInputParameterModel} from "./V1WorkflowInputParameterModel";
import {V1WorkflowOutputParameterModel} from "./V1WorkflowOutputParameterModel";
import {Workflow} from "../../mappings/v1.0/Workflow";
import {Serializable} from "../interfaces/Serializable";
import {RequirementBaseModel} from "../d2sb/RequirementBaseModel";
import {Validation} from "../helpers/validation/Validation";
import {ensureArray, spreadSelectProps} from "../helpers/utils";
import {InputParameter} from "../../mappings/v1.0/InputParameter";
import {WorkflowOutputParameter} from "../../mappings/v1.0/WorkflowOutputParameter";
import {V1WorkflowStepInputModel} from "./V1WorkflowStepInputModel";
import {EdgeNode} from "../helpers/Graph";
import {CWLVersion} from "../../mappings/v1.0/CWLVersion";
import {STEP_OUTPUT_CONNECTION_PREFIX} from "../helpers/constants";
import {Process} from "../generic/Process";

export class V1WorkflowModel extends WorkflowModel implements Serializable<Workflow> {
    public id: string;

    public cwlVersion: CWLVersion =  "v1.0";

    public class = "Workflow";

    public steps: V1StepModel[] = [];

    public inputs: V1WorkflowInputParameterModel[] = [];

    public outputs: V1WorkflowOutputParameterModel[] = [];

    public hints: RequirementBaseModel[] = [];

    public requirements: RequirementBaseModel[] = [];

    constructor(workflow?: Workflow, loc?: string) {
        super(loc || "document");

        if (workflow) this.deserialize(workflow);
        this.graph = this.constructGraph();
    }

    public validate() {
        try {
            this.graph.topSort();
        } catch (ex) {
            if (ex === "Graph has cycles") {
                this.validation.errors.push({
                    loc: this.loc,
                    message: "Graph has cycles"
                })
            } else if (ex === "Can't sort unconnected graph") {
                this.validation.warnings.push({
                    loc: this.loc,
                    message: "Graph is not connected"
                })
            }
        }
    }

    public loc: string;
    public customProps: any = {};

    public addStepFromProcess(proc: Process): V1StepModel {
        const loc = `${this.loc}.steps[${this.steps.length}]`;
        const step = new V1StepModel({
            in: [],
            out: [],
            run: proc
        }, loc);
        step.setValidationCallback(err => this.updateValidity(err));
        this.steps.push(step);

        this.addStepToGraph(step);
        return step;
    }

    /**
     * Adds Input, Output, or Step to workflow. Does not add them to the graph.
     */
    public addEntry(entry: V1StepModel | V1WorkflowInputParameterModel | V1WorkflowOutputParameterModel, type: "inputs" | "outputs" | "steps") {
        entry.loc = `${this.loc}.${type}[${this[type].length}]`;

        (this[type] as Array<any>).push(entry);

        entry.setValidationCallback((err: Validation) => {
            this.updateValidity(err);
        });
        return entry;
    }

    /**
     * Connects two vertices which have already been added to the graph
     */
    public connect(source: EdgeNode, destination: EdgeNode, isVisible = true) {
        this.graph.addEdge(source, destination, isVisible);
    }


    public exposePort(inPort: V1WorkflowStepInputModel) {
        super._exposePort(inPort, V1WorkflowInputParameterModel);
    }

    protected getSourceConnectionId(source: string): string {
        if ( /[\/]+/.test(source) ) {
            return STEP_OUTPUT_CONNECTION_PREFIX + source;
        } else {
            return `${STEP_OUTPUT_CONNECTION_PREFIX}${source}/${source}`;
        }
    }

    serialize(): Workflow {
        const base: Workflow = <Workflow>{};

        base.class      = "Workflow";
        base.cwlVersion = "v1.0";

        base.inputs  = <Array<InputParameter>> this.inputs.map(input => input.serialize());
        base.outputs = <Array<WorkflowOutputParameter>> this.outputs.map(output => output.serialize());
        base.steps   = this.steps.map(step => step.serialize());

        return Object.assign({}, this.customProps, base);
    }

    deserialize(workflow: Workflow): void {
        const serializedKeys = [
            "class",
            "id",
            "inputs",
            "outputs",
            "hints",
            "requirements",
            "steps",
            "cwlVersion"
        ];

        this.id = workflow.id;

        ensureArray(workflow.inputs, "id", "type").forEach((input, i) => {
            this.addEntry(new V1WorkflowInputParameterModel(input, `${this.loc}.inputs[${i}]`), "inputs");
        });

        ensureArray(workflow.outputs, "id", "type").forEach((output, i) => {
            this.addEntry(new V1WorkflowOutputParameterModel(output, `${this.loc}.outputs[${i}]`), "outputs");
        });

        ensureArray(workflow.steps, "id").forEach((step, i) => {
            this.addEntry(new V1StepModel(step, `${this.loc}.steps[${i}]`), "steps");
        });

        // populates object with all custom attributes not covered in model
        spreadSelectProps(workflow, this.customProps, serializedKeys);

    }
}
